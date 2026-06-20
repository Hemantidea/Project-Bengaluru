import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      event_type, 
      latitude, 
      longitude, 
      event_cause, 
      vehicle_tier, 
      requires_road_closure, 
      start_datetime,
      description,
      address
    } = body;

    const targetLat = parseFloat(latitude);
    const targetLon = parseFloat(longitude);

    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    const mlResponse = await fetch(`${pythonApiUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type,
        latitude: targetLat,
        longitude: targetLon,
        event_cause,
        vehicle_tier,
        requires_road_closure,
        start_datetime,
        description: description || "",
        address: address || ""
      })
    });

    if (!mlResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch ML predictions" }, { status: 500 });
    }

    const mlData = await mlResponse.json();

    const essScore = mlData.ess_score || 30;
    const radiusInMeters = essScore * 12;
    const radiusInDegrees = radiusInMeters / 111000;
    const radiusSquared = Math.pow(radiusInDegrees, 2);

    // 1. Query the 3 closest checkpoints (yellow pins)
    const checkpoints: any[] = await prisma.$queryRaw`
      SELECT id, name, latitude, longitude,
      ( power(latitude - ${targetLat}::double precision, 2) + power(longitude - ${targetLon}::double precision, 2) ) as distance_val
      FROM "Junction"
      ORDER BY distance_val ASC
      LIMIT 3;
    `;

    const upstream_diversions: any[] = [];
    const safe_outlets: any[] = [];

    // Extract checkpoint IDs to exclude them from being chosen as outlets
    const cp1 = checkpoints[0]?.id || 'dummy_id_1';
    const cp2 = checkpoints[1]?.id || 'dummy_id_2';
    const cp3 = checkpoints[2]?.id || 'dummy_id_3';
    
    let out1 = 'dummy_outlet_1';
    let out2 = 'dummy_outlet_2';

    // 2. Loop through checkpoints and query unique, non-overlapping outlets
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      let outlets: any[] = [];

      if (i === 0) {
        // Exclude all checkpoint IDs
        outlets = await prisma.$queryRaw`
          SELECT id, name, latitude, longitude,
          ( power(latitude - ${cp.latitude}::double precision, 2) + power(longitude - ${cp.longitude}::double precision, 2) ) as dist
          FROM "Junction"
          WHERE id NOT IN (${cp1}, ${cp2}, ${cp3})
          AND ( power(latitude - ${targetLat}::double precision, 2) + power(longitude - ${targetLon}::double precision, 2) ) > ${radiusSquared}::double precision
          ORDER BY dist ASC
          LIMIT 1;
        `;
        if (outlets.length > 0) out1 = outlets[0].id;

      } else if (i === 1) {
        // Exclude all checkpoints + first selected outlet
        outlets = await prisma.$queryRaw`
          SELECT id, name, latitude, longitude,
          ( power(latitude - ${cp.latitude}::double precision, 2) + power(longitude - ${cp.longitude}::double precision, 2) ) as dist
          FROM "Junction"
          WHERE id NOT IN (${cp1}, ${cp2}, ${cp3}, ${out1})
          AND ( power(latitude - ${targetLat}::double precision, 2) + power(longitude - ${targetLon}::double precision, 2) ) > ${radiusSquared}::double precision
          ORDER BY dist ASC
          LIMIT 1;
        `;
        // Fixed: only assign the second outlet's ID to out2, leaving out1 preserved
        if (outlets.length > 0) out2 = outlets[0].id;

      } else {
        // Exclude all checkpoints + both previously selected outlets
        outlets = await prisma.$queryRaw`
          SELECT id, name, latitude, longitude,
          ( power(latitude - ${cp.latitude}::double precision, 2) + power(longitude - ${cp.longitude}::double precision, 2) ) as dist
          FROM "Junction"
          WHERE id NOT IN (${cp1}, ${cp2}, ${cp3}, ${out1}, ${out2})
          AND ( power(latitude - ${targetLat}::double precision, 2) + power(longitude - ${targetLon}::double precision, 2) ) > ${radiusSquared}::double precision
          ORDER BY dist ASC
          LIMIT 1;
        `;
      }

      if (outlets.length > 0) {
        upstream_diversions.push(cp);
        safe_outlets.push(outlets[0]);
      }
    }

    const savedEvent = await prisma.event.create({
      data: {
        event_type: event_type || "unplanned",
        latitude: targetLat,
        longitude: targetLon,
        event_cause,
        vehicle_tier,
        requires_road_closure,
        start_datetime: new Date(start_datetime),
        duration_minutes: mlData.predicted_duration,
        ess_score: mlData.ess_score,
        status: "active"
      }
    });

    return NextResponse.json({
      event: savedEvent,
      resources: mlData.resources,
      guessed_landmark: mlData.guessed_landmark,
      upstream_diversions,
      safe_outlets
    });

  } catch (error) {
    console.error("API routing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
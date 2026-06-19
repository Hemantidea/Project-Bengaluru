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
      start_datetime 
    } = body;

    // 1. Call your Python FastAPI server running on localhost:8000
    const mlResponse = await fetch('http://127.0.0.1:8000/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude,
        longitude,
        event_cause,
        vehicle_tier,
        requires_road_closure,
        start_datetime
      })
    });

    if (!mlResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch ML predictions" }, { status: 500 });
    }

    const mlData = await mlResponse.json();

    // 2. Raw PostGIS Spatial Query: ST_Distance calculation on Bengaluru geography
    // This finds the 3 physically nearest named junctions to the incident
    const upstreamJunctions: any[] = await prisma.$queryRaw`
      SELECT id, name, latitude, longitude,
      (ST_Distance(
        ST_MakePoint(longitude, latitude)::geography,
        ST_MakePoint(${longitude}, ${latitude})::geography
      )) as distance_meters
      FROM "Junction"
      ORDER BY distance_meters ASC
      LIMIT 3;
    `;

    // 3. Save the predictive event in the Neon cloud database via Prisma
    const savedEvent = await prisma.event.create({
      data: {
        event_type: event_type || "unplanned", // Fallback if missing
        latitude,
        longitude,
        event_cause,
        vehicle_tier,
        requires_road_closure,
        start_datetime: new Date(start_datetime),
        duration_minutes: mlData.predicted_duration,
        ess_score: mlData.ess_score,
        status: "active"
      }
    });

    // 4. Return the consolidated spatial-temporal action payload to the client
    return NextResponse.json({
      event: savedEvent,
      resources: mlData.resources,
      upstream_diversions: upstreamJunctions
    });

  } catch (error) {
    console.error("API routing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
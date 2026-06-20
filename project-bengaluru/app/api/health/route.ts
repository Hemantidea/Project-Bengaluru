import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    
    // Ping the Python server's health check
    const response = await fetch(`${pythonApiUrl}/health`);
    
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Backend responded with error" }, { status: 500 });
  } catch (error) {
    console.error("Health check ping failed:", error);
    return NextResponse.json({ error: "Backend offline" }, { status: 500 });
  }
}
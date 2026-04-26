import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const dataFile = path.join(process.cwd(), "data", "world-state.json");

const defaultState = {
  collectedPickups: [] as string[],
  completedMissions: [] as string[],
  lastSaved: null as string | null
};

async function ensureDataFile() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(defaultState, null, 2), "utf8");
  }
}

export async function GET() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  return NextResponse.json(JSON.parse(raw));
}

export async function POST(request: Request) {
  await ensureDataFile();
  const body = (await request.json()) as Partial<typeof defaultState>;

  const payload = {
    collectedPickups: Array.isArray(body.collectedPickups) ? body.collectedPickups : [],
    completedMissions: Array.isArray(body.completedMissions) ? body.completedMissions : [],
    lastSaved: new Date().toISOString()
  };

  await fs.writeFile(dataFile, JSON.stringify(payload, null, 2), "utf8");
  return NextResponse.json(payload);
}

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "event_cause" TEXT NOT NULL,
    "vehicle_tier" TEXT NOT NULL,
    "requires_road_closure" BOOLEAN NOT NULL DEFAULT false,
    "start_datetime" TIMESTAMP(3) NOT NULL,
    "duration_minutes" DOUBLE PRECISION,
    "ess_score" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Junction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Junction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Junction_name_key" ON "Junction"("name");

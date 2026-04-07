import { calendarEvents } from "../data/calendar-events.js";

export default async function handler(req, res) {
  const now = new Date();
  let nextRaceAssigned = false;

  const enriched = calendarEvents.map((event) => {
    const endDate = new Date(`${event.end}T23:59:59Z`);
    let status = "upcoming";

    if (endDate < now) {
      status = "completed";
    } else if (!nextRaceAssigned && event.type === "race") {
      status = "next";
      nextRaceAssigned = true;
    }

    return { ...event, status };
  });

  return res.status(200).json({ events: enriched });
}

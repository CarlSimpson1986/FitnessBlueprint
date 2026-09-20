"use client";

import { useState } from "react";
import { toLocalDateKey } from "@/lib/format";
import { CreateSessionForm } from "./CreateSessionForm";
import { SessionsByDay } from "./SessionsByDay";

type Template = { id: string; name: string; default_capacity: number };
type Coach = { id: string; full_name: string };
type EnrichedSession = {
  id: string;
  session_date: string;
  start_time: string;
  capacity: number;
  templateName: string;
  coachName: string;
  spotsTaken: number;
  planText: string | null;
};

export function ManageSessionsClient({
  templates,
  coaches,
  sessions,
}: {
  templates: Template[];
  coaches: Coach[];
  sessions: EnrichedSession[];
}) {
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()));

  return (
    <>
      <CreateSessionForm templates={templates} coaches={coaches} selectedDate={selectedDate} />
      <SessionsByDay sessions={sessions} selected={selectedDate} onSelectDate={setSelectedDate} />
    </>
  );
}

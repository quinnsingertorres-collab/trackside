import { notFound } from "next/navigation";
import { LINE_BY_KEY, LINES } from "@/lib/lines";
import LineView from "@/components/LineView";

export function generateStaticParams() {
  return LINES.map((l) => ({ line: l.key }));
}

export async function generateMetadata({ params }) {
  const { line } = await params;
  const l = LINE_BY_KEY[line];
  return { title: l ? `${l.name} — Trackside` : "Trackside" };
}

export default async function Page({ params }) {
  const { line } = await params;
  if (!LINE_BY_KEY[line]) notFound();
  return <LineView lineKey={line} />;
}

import { notFound } from "next/navigation";
import { getCar } from "@/lib/roster";
import CarView from "@/components/CarView";

export async function generateMetadata({ params }) {
  const { carId } = await params;
  const car = getCar(carId);
  return { title: car ? `${car.line} Line ${car.numberDisplay} — Trackside` : "Trackside" };
}

export default async function Page({ params }) {
  const { carId } = await params;
  const car = getCar(carId);
  if (!car) notFound();
  return <CarView car={car} />;
}

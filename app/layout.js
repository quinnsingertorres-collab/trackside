import { Big_Shoulders, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import AppChrome from "@/components/AppChrome";

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});
const body = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Trackside — MBTA fleet photo log",
  description:
    "A spotting log for the MBTA's Red, Orange, Blue, and Green Line fleets — browse every car's roster page and attach photos to the exact car you shot.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}

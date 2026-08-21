"use client";

import { PhotosProvider } from "@/lib/PhotosContext";
import Header from "@/components/Header";
import UploadModal from "@/components/UploadModal";
import Toast from "@/components/Toast";

export default function AppChrome({ children }) {
  return (
    <PhotosProvider>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <main className="app-main" id="main">
        {children}
      </main>
      <footer className="site">
        Trackside is an unofficial, fan-made fleet photo log for the MBTA rapid transit system — not affiliated with the MBTA.
        Roster numbers are drawn from public MBTA rolling-stock records and may drift as cars are delivered or retired.
        Data feed for other tools: <code>/api/photos</code> and <code>/roster.json</code>.
      </footer>
      <UploadModal />
      <Toast />
    </PhotosProvider>
  );
}

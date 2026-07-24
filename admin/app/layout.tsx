import type { Metadata } from "next";
import { IBM_Plex_Sans, Syne } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-ibm",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SnapCal Ops",
  description: "SnapCal admin — models, feedback, datasets, training",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${ibmPlex.variable}`}>
      <body>
        <div className="app-shell">
          <Nav />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}

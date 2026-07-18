import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rival Refs",
  description: "Two rival AI commentators trade banter over a replayed match.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className="bg-[#050507] text-white antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

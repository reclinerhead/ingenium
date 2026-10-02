import type { Metadata } from "next";
import { Big_Shoulders, Bodoni_Moda, Courier_Prime } from "next/font/google";
import "./globals.css";

// next/font has no metrics for Big Shoulders, so it can't synthesize an
// adjusted fallback; name a condensed one by hand instead.
const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  axes: ["opsz"],
  adjustFontFallback: false,
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});

const bodoniModa = Bodoni_Moda({
  variable: "--font-bodoni-moda",
  subsets: ["latin"],
  style: ["italic"],
  axes: ["opsz"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Ingenia",
  description:
    "A short 1980s street, seven residents, and the Ingenium Engine behind them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bigShoulders.variable} ${bodoniModa.variable} ${courierPrime.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

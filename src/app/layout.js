import "./globals.css";

export const metadata = {
  title: "Anchorism",
  description: "Secure access portal.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

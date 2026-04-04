import "./globals.css";

export const metadata = {
  title: "OBG Admin",
  description: "Protected GitHub-backed editor for the OBG question bank",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Cormorant_Garamond, Inter, Marck_Script } from "next/font/google";
import "./globals.css";

// Постоянный набор шрифтов дневника (раздел 6 ТЗ), все с кириллицей, лицензия SIL OFL
const serif = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
});
const sans = Inter({ variable: "--font-sans", subsets: ["latin", "cyrillic"] });
const hand = Marck_Script({
  variable: "--font-hand",
  subsets: ["latin", "cyrillic"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Дневник атмосферы дня",
  description: "Текст, фото и песня превращаются в воспоминание о дне",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${serif.variable} ${sans.variable} ${hand.variable}`}
    >
      <body>
        <header className="site-header">
          <Link href="/" className="logo">
            Дневник атмосферы
          </Link>
          <nav>
            <Link href="/">Новый день</Link>
            <Link href="/archive">Архив</Link>
          </nav>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}

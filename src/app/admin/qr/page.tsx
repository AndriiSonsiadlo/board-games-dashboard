import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { PrintButton } from "@/components/admin/PrintButton";
import { BrandMark } from "@/components/brand/Wordmark";
import { fmt, getDict } from "@/i18n";
import { getLang } from "@/i18n/server";
import { requireAdminPage } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { getAdminSnapshot } from "@/server/live";
import { qrLinks, qrSvg, resolveBaseUrl, type QrTarget } from "@/server/qr";

export const dynamic = "force-dynamic";

export default async function QrSheetPage() {
  await requireAdminPage();
  const t = getDict(await getLang());
  const { event } = getAdminSnapshot(getDb());
  const base = resolveBaseUrl(event.publicBaseUrl, (await headers()).get("host"));
  const codes = await Promise.all(qrLinks(base).map(async (link) => ({ ...link, svg: await qrSvg(link.url) })));
  const labels: Record<QrTarget, [string, string]> = {
    site: [t.qr.site, t.qr.siteHint],
    checkin: [t.qr.checkin, t.qr.checkinHint],
    screen: [t.qr.screen, t.qr.screenHint],
    admin: [t.qr.admin, t.qr.adminHint],
  };

  return (
    <div className="min-h-dvh bg-white text-black">
      <div className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:p-0">
        <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
          <Link href="/admin/settings" className="inline-flex items-center gap-2 text-sm">
            <ArrowLeft className="size-4" />
            {t.qr.back}
          </Link>
          <PrintButton label={t.qr.print} />
        </div>
        {event.publicBaseUrl ? null : (
          <p className="mb-6 rounded-md border border-black/30 p-3 text-sm print:hidden">{fmt(t.qr.noBaseUrl, { url: base })}</p>
        )}
        <header className="mb-8 flex items-end justify-between border-b-2 border-black pb-4">
          <div>
            <div className="font-display text-4xl uppercase leading-none tracking-tight">{t.common.appName}</div>
            <div className="mt-2 font-display text-sm uppercase tracking-[0.3em]">
              {event.city} · {event.year}
            </div>
          </div>
          <BrandMark className="size-12" />
        </header>
        <ul className="grid grid-cols-2 gap-6">
          {codes.map((code) => (
            <li key={code.target} className="flex break-inside-avoid flex-col items-center rounded-md border border-black/20 p-6 text-center">
              <div className="w-full max-w-[240px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: code.svg }} />
              <div className="mt-5 font-display text-2xl uppercase tracking-wide">{labels[code.target][0]}</div>
              <div className="mt-1 text-sm">{labels[code.target][1]}</div>
              <div className="mt-3 font-mono text-xs">{code.url}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

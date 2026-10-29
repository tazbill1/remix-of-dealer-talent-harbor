import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AbcLogo } from "@/components/abc-logo";
import { useOrg } from "@/lib/org";
import { CAREERS_ORG_SLUG, SITE_URL } from "@/lib/site";

const swatches = [
  { name: "Red", cls: "bg-abc-red" }, { name: "Black", cls: "bg-abc-black" },
  { name: "Yellow", cls: "bg-abc-yellow" }, { name: "Gray", cls: "bg-abc-gray" }, { name: "White", cls: "bg-abc-white" },
];

/** Career site overview: link, logo and colors. Only the configured group has a branded site. */
export function CareerSiteSettings() {
  const org = useOrg();
  const branded = org.orgSlug === CAREERS_ORG_SLUG;
  const url = branded ? `${SITE_URL}/careers` : `${SITE_URL}/c/${org.orgSlug}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Career site</CardTitle>
        <CardDescription>The public page where job seekers see your open jobs and apply.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-muted px-3 py-2 text-sm break-all">{url}</code>
          <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Link copied"); }}><Copy />Copy link</Button>
          {branded
            ? <Button asChild size="sm"><Link to="/careers" target="_blank"><ExternalLink />Open site</Link></Button>
            : <Button asChild size="sm"><a href={url} target="_blank" rel="noreferrer"><ExternalLink />Open site</a></Button>}
        </div>
        {branded && (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">Logo</p>
              <div className="inline-flex rounded-lg bg-abc-black p-4 text-abc-white"><AbcLogo /></div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Colors</p>
              <div className="flex flex-wrap gap-3">
                {swatches.map((s) => (
                  <div key={s.name} className="text-center text-xs text-muted-foreground">
                    <div className={`size-12 rounded-md border ${s.cls}`} />{s.name}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

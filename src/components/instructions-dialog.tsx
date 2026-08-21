import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export function InstructionsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BookOpen className="h-4 w-4" />
          <span className="hidden sm:inline">Instructions</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> How to use Loop
          </DialogTitle>
          <DialogDescription>
            A step-by-step guide to run your adaptive video publisher end-to-end.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          <div className="space-y-6 text-sm leading-relaxed">
            <Section n="1" title="Connect Buffer">
              <p>Go to <b>Settings → Buffer</b>. Enter an account name and paste your <b>Buffer Personal API token</b>, then click <b>Save</b>. Loop automatically fetches all channels from your Buffer organizations and populates the Channels list. You should see a "Successfully synced X channels" toast.</p>
            </Section>

            <Section n="2" title="Create a Campaign">
              <p>Open <b>Campaigns</b> from the sidebar and create your first campaign (e.g. "Product Shorts"). Every video, run, and learning insight is scoped to a campaign. Use the <b>campaign selector</b> at the top of the sidebar to switch context.</p>
            </Section>

            <Section n="3" title="Configure AI, Analysis & Scheduler">
              <p>Under <b>Settings</b>:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li><b>AI</b> — pick the generation model and objective (views, engagement, saves...).</li>
                <li><b>Analysis</b> — choose how many frames to sample from each video for vision analysis.</li>
                <li><b>Scheduler</b> — enable the autonomous cron, set post interval and active window per channel.</li>
                <li><b>General</b> — campaign-wide preferences and defaults.</li>
              </ul>
            </Section>

            <Section n="4" title="Add videos to the Queue">
              <p>Go to <b>Queue</b> and paste one or more <b>Cloudinary video URLs</b> (one per line, or use bulk CSV/TXT import). Each URL becomes one run. Duplicates are ignored automatically. Drag to reorder priority.</p>
            </Section>

            <Section n="5" title="First run (Cold start)">
              <p>On the <b>Dashboard</b>, select a channel and click <b>Manual run</b> to trigger the first video. Loop will:</p>
              <ol className="list-decimal ml-5 space-y-1">
                <li>Sample frames and run <b>vision analysis</b> (objects, emotions, topic).</li>
                <li>Generate a caption tuned to your objective.</li>
                <li>Publish immediately to Buffer.</li>
                <li>Save the artifact for future learning.</li>
              </ol>
            </Section>

            <Section n="6" title="Let the learning loop run">
              <p>Once the scheduler is enabled, Loop runs autonomously:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>The <b>analytics cron</b> pulls fresh Buffer metrics for published posts.</li>
                <li>The <b>learning engine</b> writes structured reports and durable insights.</li>
                <li>The <b>strategy engine</b> decides the next caption approach.</li>
                <li>The <b>prediction engine</b> forecasts metrics and later scores itself.</li>
              </ul>
            </Section>

            <Section n="7" title="Monitor progress">
              <ul className="list-disc ml-5 space-y-1">
                <li><b>Dashboard</b> — queue progress, next scheduled post, success rate, top learnings.</li>
                <li><b>Sheet</b> — every run with status, caption, metrics, and strategy used.</li>
                <li><b>Learning</b> — browse durable memory insights with confidence scores.</li>
                <li><b>Insights</b> — trends across runs and prediction accuracy.</li>
              </ul>
            </Section>

            <Section n="8" title="Troubleshooting">
              <ul className="list-disc ml-5 space-y-1">
                <li>No channels after save? Re-check your Buffer API token and click <b>Resync</b>.</li>
                <li>Runs stuck? The reliability layer auto-recovers stale runs; failed runs land in the <b>Dead Letter Queue</b>.</li>
                <li>No insights yet? Learning starts after the first published post has analytics (usually within a few hours).</li>
              </ul>
            </Section>

            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              Tip: the full autonomous flow is Buffer → Campaign → Queue URLs → Scheduler on → sit back. Loop learns and improves each run automatically.
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">{n}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="text-muted-foreground space-y-2">{children}</div>
    </div>
  );
}

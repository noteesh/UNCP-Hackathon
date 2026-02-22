import React from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { Card } from "../components/ui/card";
import { VoiceAssistantButton } from "../components/voice-assistant-button";

const RESEARCH_TRANSCRIPT =
  "Research references. Papers and sources used by AURA. This page lists external research links and local documents that support the assessment.";



/** External research links (each in its own card). */
const RESEARCH_LINKS: { title: string; url: string }[] = [
  { title: "Springer — Journal of Clinical Monitoring (s10877-017-0009-z)", url: "https://link.springer.com/article/10.1007/s10877-017-0009-z" },
  { title: "Springer — Journal of Clinical Monitoring (s10877-023-00974-x)", url: "https://link.springer.com/article/10.1007/s10877-023-00974-x" },
  { title: "IEEE Xplore — document 10521720", url: "https://ieeexplore.ieee.org/document/10521720?denied=" },
  { title: "Movement Disorders (DOI 10.1002/mds.27014)", url: "https://doi.org/10.1002/mds.27014" },
  { title: "PubMed — Effects of Lifestyle Intervention (PMID 34702086)", url: "https://pubmed.ncbi.nlm.nih.gov/34702086/" },
  { title: "Oxford — The Journals of Gerontology (glae122)", url: "https://doi.org/10.1093/gerona/glae122" },
  { title: "Springer — Journal of Neurology (s00415-020-10385-z)", url: "https://link.springer.com/article/10.1007/s00415-020-10385-z" },
  { title: "Movement Disorders — Wiley Online Library", url: "https://movementdisorders.onlinelibrary.wiley.com/doi/10.1002/mds.27014" },
];

export function ResearchReferencesScreen() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#0a0f1e] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />
      <div className="max-w-3xl mx-auto px-6 py-10 relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <BookOpen className="h-8 w-8 text-[#00d4ff]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Research references</h1>
            <p className="text-sm text-white/60">Papers and sources used by AURA</p>
          </div>
        </div>

        {/* External links — one card per link */}
        <div className="space-y-4 mb-10">
          {RESEARCH_LINKS.map((item) => (
            <Card key={item.url} className="p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 group"
              >
                <span className="flex-1 text-white/90 group-hover:text-white" title={item.url}>
                  {item.title}
                </span>
                <ExternalLink className="h-4 w-4 text-white/50 group-hover:text-[#00d4ff] shrink-0" />
              </a>
            </Card>
          ))}
        </div>
      </div>
      <VoiceAssistantButton instructionType="research_references" transcript={RESEARCH_TRANSCRIPT} />
    </div>
  );
}

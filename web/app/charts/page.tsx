'use client';
import {
  ScoreCurve,
  NoiseBandGauge,
  RunDots,
  UseCaseMatrix,
  DeltaPair,
  DigestCheck,
  StatusMark,
  TreeDiagram,
} from '@/components/charts';
import { mlScoreCurvePoints, mlTreeData, mlUseCaseRows } from '@/lib/mlTreeFigures';
import { chartTokens, chartFonts } from '@/lib/chartTokens';
import Link from 'next/link';

/**
 * /charts — light-theme figure gallery for the real ML tree (§7).
 * Each figure states its finding, shows uncertainty honestly, and ships a hidden data table.
 */
export default function ChartsPage() {
  const curve = mlScoreCurvePoints();
  const tree = mlTreeData();
  const matrix = mlUseCaseRows();

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 860 }}>
      <Link href="/" style={{ color: chartTokens.muted, fontSize: 13, textDecoration: 'none', fontFamily: chartFonts.mono }}>
        ← gate
      </Link>
      <h1 style={{ fontFamily: chartFonts.serif, fontSize: 32, color: chartTokens.ink, margin: '12px 0 8px', fontWeight: 500 }}>
        Light-theme charts and statistics
      </h1>
      <p style={{ fontFamily: chartFonts.sans, fontSize: 14, color: chartTokens.muted, maxWidth: 620, lineHeight: 1.6 }}>
        Every chart is a printed-paper figure: quiet, precise, honest about uncertainty. Light theme only.
        Status is never colour alone — shape carries meaning.
      </p>

      <div style={{ display: 'flex', gap: 10, margin: '16px 0 32px', flexWrap: 'wrap' }}>
        {(['accepted', 'rejected', 'pending', 'contested', 'void'] as const).map((s) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: chartFonts.mono, fontSize: 11, color: chartTokens.muted }}>
            <StatusMark status={s} size={14} label={`legend ${s}`} /> {s}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <section>
          <TreeDiagram nodes={tree} />
        </section>

        <section>
          <ScoreCurve
            points={curve}
            title="Adam is the only optimiser that clears the noise band"
            caption="Stepped score along the gate path in order (baseline → standardise → Adam). Crosses are measured but rejected changes at their measured score. Void shows —, never zero."
          />
        </section>

        <section>
          <NoiseBandGauge
            effectBp={760}
            ciLowBp={210}
            ciHighBp={1210}
            minEffectBp={300}
            claimLabel="Adam"
            title="Adam clears the minimum, so the gain counts"
          />
        </section>

        <section>
          <NoiseBandGauge
            effectBp={670}
            ciLowBp={-120}
            ciHighBp={1420}
            minEffectBp={300}
            claimLabel="momentum"
            title="Momentum looks better, but the interval crosses zero"
          />
        </section>

        <section>
          <RunDots
            parentRunsBp={[8430, 8510, 8380, 8470, 8440]}
            candidateRunsBp={[9190, 9210, 9170, 9230, 9180]}
            title="Adam shifts every run, not just the mean"
          />
        </section>

        <section>
          <UseCaseMatrix rows={matrix} changeLabels={['standardise', 'Adam']} />
        </section>

        <section>
          <h3 style={{ fontFamily: chartFonts.serif, fontSize: 17, color: chartTokens.ink, margin: '0 0 12px', fontWeight: 500 }}>
            Adam gains against both base and parent
          </h3>
          <DeltaPair vsBaseBp={2870} vsParentBp={760} />
        </section>

        <section>
          <DigestCheck
            digestA="54008836f7f8bf5fb529712cf5845ec89c175d7b9d431251b7ebdc5b19d8bf0d"
            digestB="54008836f7f8bf5fb529712cf5845ec89c175d7b9d431251b7ebdc5b19d8bf0d"
            labelA="Claimed digest"
            labelB="Verified digest"
          />
        </section>

        <section>
          <DigestCheck
            digestA="af505bbd05514d887d7255481592b5aa7942992459f394519941a9081ef64ff7"
            digestB="236f92314367421097663cdb29d4c08ec35dcf4a2dd52147794034769d775964"
            labelA="Verifier 1"
            labelB="Verifier 2"
            title="When digests differ the run is contested"
          />
        </section>
      </div>
    </div>
  );
}

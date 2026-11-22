import Link from 'next/link'
import type { Gauge, GaugeSize, Pattern } from '@stitch/pattern-ir'
import styles from './Workspace.module.css'

export type GaugeMode = 'unset' | 'as_is' | 'recalc' | 'remeasure'

export const GAUGE_STATE: Record<GaugeMode, string> = {
  unset: '게이지를 아직 정하지 않음',
  as_is: '도안 숫자 그대로',
  recalc: '내 게이지로 다시 계산',
  remeasure: '바늘을 바꿔 다시 재기',
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

export function gaugeText(g: GaugeSize): string {
  return `${num(g.stitches)}코 × ${num(g.rows)}단`
}

type Props = {
  patternId: string
  ir: Pattern
  /** 도안에 적힌 게이지 (다시 계산하기 전의 값) */
  patternGauge: Gauge | null
  gaugeMode: GaugeMode
  myGauge: GaugeSize | null
  hasPdf: boolean
}

/** 준비물과 도안 정보: 재료, 게이지 상태, 완성 크기 */
export function InfoPanel({ patternId, ir, patternGauge, gaugeMode, myGauge, hasPdf }: Props) {
  const base = `/patterns/${encodeURIComponent(patternId)}`
  const size = [ir.finished.width_cm ? `가로 ${num(ir.finished.width_cm)}cm` : '', ir.finished.height_cm ? `세로 ${num(ir.finished.height_cm)}cm` : ''].filter(Boolean).join(', ')
  return (
    <section className={styles.info} id="info" aria-labelledby="info-h">
      <h2 className={styles.sectionTitle} id="info-h">
        준비물과 도안 정보
      </h2>
      <div className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <h3 className={styles.infoK}>준비물</h3>
          {ir.materials.length === 0 ? (
            <p className={styles.infoV}>도안에서 읽은 준비물이 없어요.</p>
          ) : (
            <ul className={styles.materials}>
              {ir.materials.map((m, i) => (
                <li key={i}>
                  <span className={styles.materialKind}>{m.kind}</span>
                  <span>
                    {m.spec}
                    {m.qty ? ` · ${m.qty}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.infoCard}>
          <h3 className={styles.infoK}>게이지</h3>
          <p>
            <span className="chip chip-accent" data-testid="gauge-state">
              {GAUGE_STATE[gaugeMode]}
            </span>
          </p>
          <p className={styles.infoV}>
            {patternGauge ? (
              <>
                도안 게이지 <strong>{gaugeText(patternGauge)}</strong> ({patternGauge.over_cm}cm, {patternGauge.in_stitch}, {num(patternGauge.tool_mm)}mm)
              </>
            ) : (
              '도안에 게이지가 적혀 있지 않아요.'
            )}
          </p>
          {gaugeMode === 'recalc' && myGauge && (
            <p className={styles.infoV}>
              내 게이지 <strong>{gaugeText(myGauge)}</strong> · 이 화면의 코 수와 단수는 내 게이지로 다시 계산한 값이에요.
            </p>
          )}
          {gaugeMode === 'remeasure' && <p className={styles.infoV}>바늘을 바꿔 다시 잴 때까지 도안 숫자 그대로 보여 드려요.</p>}
          <p className={styles.infoV}>언제든 다시 맞출 수 있습니다.</p>
          <p className={styles.infoV}>
            <Link href={`${base}/gauge`} className={styles.infoLink}>
              게이지 다시 맞추기
            </Link>
          </p>
        </div>

        <div className={styles.infoCard}>
          <h3 className={styles.infoK}>완성 크기</h3>
          <p className={styles.infoV}>{size || '도안에 완성 크기가 적혀 있지 않아요.'}</p>
          <h3 className={styles.infoK}>게이지가 다르면</h3>
          <p className={styles.infoV}>10cm 안의 코 수가 도안보다 많으면 더 굵은 바늘로, 적으면 더 가는 바늘로 바꿔 보세요.</p>
        </div>

        <div className={styles.infoCard}>
          <h3 className={styles.infoK}>읽은 내용</h3>
          <p className={styles.infoV}>이 화면은 도안에서 읽은 내용으로 만들었어요. 실제 도안과 다른 곳이 있으면 고칠 수 있어요.</p>
          <p className={styles.infoV}>
            <Link href={`${base}/review`} className={styles.infoLink}>
              읽은 내용 다시 확인하기
            </Link>
          </p>
          {hasPdf && (
            <p className={styles.infoV}>
              <a href={`/api/patterns/${encodeURIComponent(patternId)}/pdf`} className={styles.infoLink} target="_blank" rel="noopener">
                원본 PDF 열기
              </a>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

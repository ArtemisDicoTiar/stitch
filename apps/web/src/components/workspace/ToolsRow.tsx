import { rowAt } from '@stitch/engine'
import type { Expanded, Pattern } from '@stitch/pattern-ir'
import { isComplete, sectionAt, workingPos, type Pos } from './position'
import styles from './Workspace.module.css'

type Props = {
  ir: Pattern
  expanded: Expanded
  /** 사용자의 지금 위치 (고치는 중이면 그 값) */
  pos: Pos
  started: boolean
  finishingDone: number
}

const START_TEXT: Record<string, (n: number) => string> = {
  cast_on: (n) => `코 ${n}코를 잡고 시작해요.`,
  chain: (n) => `사슬 ${n}코로 시작해요.`,
  ring: (n) => `원형 코 ${n}코로 시작해요.`,
}

/**
 * 지금 단계와 준비물.
 * 단계는 지금 뜨는 구간(또는 마무리 단계)에서 나옵니다.
 * 도안에는 준비물을 언제 쓰는지가 적혀 있지 않아서, 단계별로 골라 밝히지 않고 전부 보여 줍니다.
 */
export function ToolsRow({ ir, expanded, pos, started, finishingDone }: Props) {
  let stage: string
  let note = ''
  if (isComplete(expanded, pos)) {
    const next = ir.finishing[finishingDone]
    if (next) {
      stage = `마무리 · ${next.name}`
      note = next.text
    } else {
      stage = ir.finishing.length ? '완성' : '뜨기 완료'
      note = '모든 단계를 마쳤어요. 수고하셨어요.'
    }
  } else {
    const work = workingPos(expanded, pos)
    const at = sectionAt(expanded, work.row)
    const row = rowAt(expanded, work.row)
    stage = at ? `${at.section.name} · ${at.section.rows}단 중 ${at.local}단째` : `${work.row}단`
    const first = ir.sections[0]?.start
    if (!started && work.row === 1 && work.stitch === 0 && first && START_TEXT[first.kind]) note = START_TEXT[first.kind](first.count)
    else if (row?.estimated) note = '길이로 적힌 구간이에요. 가끔 길이를 재며 떠 주세요.'
    else if (row && row.markers.length > 0) note = '마커를 쓰는 단이에요.'
  }

  return (
    <div className={styles.tools}>
      <p className={styles.toolsStage}>
        <span className={styles.toolsLabel}>{started || isComplete(expanded, pos) ? '지금 단계' : '시작 전'}</span>
        <strong data-testid="stage-name">{stage}</strong>
        {note && <span className={styles.toolsNote}>{note}</span>}
      </p>
      {ir.materials.length > 0 && (
        <ul className={styles.toolList} aria-label="준비물">
          {ir.materials.map((m, i) => (
            <li key={i} className={styles.tool}>
              <span className={styles.toolKind}>{m.kind}</span>
              {m.spec}
              {m.qty ? ` · ${m.qty}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

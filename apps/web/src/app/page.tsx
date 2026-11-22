import Link from 'next/link'
import { regauge } from '@stitch/engine'
import { practiceHood } from '@stitch/fixtures'
import { Mascot } from '@/components/Mascot'
import { SiteHeader } from '@/components/SiteHeader'
import { BRAND } from '@/lib/brand'
import { MiniChart, StitchSketch } from '@/components/home/FeatureArt'
import { SamplePreview } from '@/components/home/SamplePreview'
import styles from '@/components/home/landing.module.css'

/** 로그인 없이 보이는 정적 페이지. 데이터베이스를 읽지 않습니다. */

const STEPS = [
  { title: 'PDF 올리기', text: '가지고 있는 대바늘이나 코바늘 도안 PDF를 올려요. 준비물, 게이지, 단별 지시문을 읽어 냅니다.' },
  { title: '읽은 내용 확인', text: '줄임과 늘림을 한 코씩 따라가며 코 수가 도안과 맞는지 검산해요. 애매한 곳만 직접 보면 됩니다.' },
  { title: '내 게이지 맞추기', text: '스와치를 재서 넣으면 같은 크기가 나오도록 다시 계산해요. 재기 번거로우면 도안 숫자 그대로 떠도 됩니다.' },
  { title: '따라 뜨기', text: '3D 모형과 기호 도안에서 지금 위치를 보면서 뜨고, 뜬 만큼 날짜와 함께 기록해요.' },
]

/** 예시 표에 쓰는 손땀. 숫자는 직접 쓴 예시 도안을 엔진으로 다시 계산한 결과입니다. */
const MY_GAUGE = { stitches: 20, rows: 26 }

const cm = (v: number | undefined) => (v === undefined ? '' : `${Math.round(v * 10) / 10}cm`)

function gaugeExample() {
  const base = practiceHood.gauge
  const r = regauge(practiceHood, MY_GAUGE)
  const first = r.sections[0]
  if (!base || !r.ok || !first) return null
  return {
    title: practiceHood.title,
    rows: [
      { label: '게이지 (10cm)', pattern: `${base.stitches}코 × ${base.rows}단`, mine: `${MY_GAUGE.stitches}코 × ${MY_GAUGE.rows}단`, tone: undefined },
      { label: '그대로 뜨면 가로', pattern: cm(r.width.pattern), mine: cm(r.width.asIs), tone: 'off' as const },
      { label: '맞춰서 다시 계산한 코잡기', pattern: `${first.start.from}코`, mine: `${first.start.to}코`, tone: undefined },
      { label: '다시 계산한 뒤 가로', pattern: cm(r.width.pattern), mine: cm(r.width.recalculated), tone: 'ok' as const },
    ],
  }
}

function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  )
}

export default function Home() {
  const example = gaugeExample()
  return (
    <>
      <SiteHeader />
      <main id="main" className={styles.page}>
        <div className={styles.heroBand}>
          <div className={styles.hero}>
            <div className={styles.heroText}>
              <Mascot size={128} className={styles.heroMascot} label={`실뭉치를 껴안고 있는 ${BRAND} 캐릭터`} />
              <h1 className={styles.h1}>
                PDF 도안을 올리면
                <br />
                {/* 줄이 넘칠 때 "돼요"만 혼자 떨어지지 않게 두 덩어리로 묶습니다. */}
                <span className={styles.nowrap}>입체로 따라 뜨는</span> <span className={styles.nowrap}>페이지가 돼요</span>
              </h1>
              <p className={styles.lead}>글로 적힌 대바늘과 코바늘 도안을 한 코씩 읽어서 기호 도안, 3D 모형, 단계별 안내로 바꿔 드려요. 뜬 만큼 기록하면 3D에도 그만큼만 실이 채워집니다.</p>
              <div className={styles.heroActions}>
                <Link href="/upload" className={styles.cta}>
                  <UploadIcon />
                  PDF 도안 올리기
                </Link>
                <Link href="/upload" className={styles.heroLink}>
                  예시 도안으로 둘러보기
                </Link>
              </div>
              <p className={styles.private}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                올린 도안과 만들어진 페이지는 나만 볼 수 있어요.
              </p>
            </div>
            <div className={styles.heroArt}>
              <div className={styles.heroFrame}>
                <SamplePreview sample="practice-hood" height={540} label="연습용 후드 워머를 쓴 3D 마네킹" />
              </div>
            </div>
          </div>
        </div>

        <section className={styles.section} aria-labelledby="how">
          <div className={styles.inner}>
            <h2 id="how" className={styles.h2}>
              올리고 나면 이렇게 진행돼요
            </h2>
            <ol className={styles.steps}>
              {STEPS.map((s, i) => (
                <li key={s.title} className={styles.step}>
                  <span className={styles.stepNo} data-last={i === STEPS.length - 1 || undefined} aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className={styles.h3}>{s.title}</h3>
                  <p className={styles.soft}>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className={`${styles.section} ${styles.tinted}`} aria-labelledby="features-title">
          <div className={styles.inner}>
            <h2 id="features-title" className={styles.h2}>
              페이지 하나에 다 들어 있어요
            </h2>
            <div className={styles.features}>
              <article className={styles.feature}>
                <div className={`${styles.featureArt} ${styles.featureArtDark}`}>
                  <SamplePreview sample="practice-hood" progress={0.42} height={260} label="뜬 부분만 실로 채워진 3D 후드 워머" />
                </div>
                <div className={styles.featureBody}>
                  <h3 className={styles.h3}>뜬 만큼 채워지는 3D</h3>
                  <p className={styles.soft}>기록한 단과 코까지만 실로 보이고 나머지는 비쳐 보여요. 꽂아 둔 단수링도 같은 자리에 달립니다.</p>
                </div>
              </article>
              <article className={styles.feature}>
                <div className={styles.featureArt}>
                  <MiniChart label="지금 위치와 단수링이 표시된 기호 도안" />
                </div>
                <div className={styles.featureBody}>
                  <h3 className={styles.h3}>누를 수 있는 기호 도안</h3>
                  <p className={styles.soft}>한 칸이 1코 1단이에요. 칸을 누르면 거기까지 뜬 것으로 기록하거나 단수링을 달 수 있어요.</p>
                </div>
              </article>
              <article className={styles.feature}>
                <div className={styles.featureArt}>
                  <StitchSketch label="왼코 겹치기를 뜨는 바늘과 실 그림" />
                </div>
                <div className={styles.featureBody}>
                  <h3 className={styles.h3}>기호별 뜨는 법</h3>
                  <p className={styles.soft}>도안에 나오는 기호마다 바늘과 실이 움직이는 순서를 보여 줘요. 왼손과 오른손이 할 일도 따로 적혀 있어요.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="gauge-title">
          <div className={`${styles.inner} ${styles.split}`}>
            <div className={styles.splitText}>
              <h2 id="gauge-title" className={styles.h2}>
                손땀이 달라도 같은 크기로
              </h2>
              <p className={styles.softLead}>같은 실과 바늘이어도 사람마다 코의 크기가 달라요. 스와치를 떠서 10cm 안의 코와 단을 알려 주면, 완성 크기가 도안과 같아지도록 숫자를 다시 계산합니다.</p>
              <Link href="/upload" className={styles.textLink}>
                도안 올리고 게이지 맞추기
              </Link>
            </div>
            {example && (
              <div className={styles.tableCard}>
                <table className={styles.table}>
                  <caption className="sr-only">{example.title} 도안으로 계산한 예시</caption>
                  <thead>
                    <tr>
                      <th scope="col">예시</th>
                      <th scope="col">도안</th>
                      <th scope="col">내 손땀</th>
                    </tr>
                  </thead>
                  <tbody>
                    {example.rows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>{row.pattern}</td>
                        <td className={styles.mine} data-tone={row.tone}>
                          {row.mine}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className={`${styles.section} ${styles.dark}`} aria-labelledby="mannequin-title">
          <div className={`${styles.inner} ${styles.split}`}>
            <div className={styles.figures}>
              <figure className={styles.figure}>
                <div className={styles.figureArt}>
                  <SamplePreview sample="practice-hood" avatar="default" height={300} label="기본 회색 마네킹" />
                </div>
                <figcaption className={styles.figcaption}>기본 마네킹</figcaption>
              </figure>
              <figure className={styles.figure}>
                <div className={`${styles.figureArt} ${styles.figureArtOn}`}>
                  <SamplePreview sample="practice-hood" avatar="styled" height={300} label="피부 톤, 앞머리, 둥근 안경으로 꾸민 마네킹" />
                </div>
                <figcaption className={`${styles.figcaption} ${styles.figcaptionOn}`}>꾸민 마네킹</figcaption>
              </figure>
            </div>
            <div className={styles.splitText}>
              <span className={styles.plusBadge}>플러스</span>
              <h2 id="mannequin-title" className={styles.h2}>
                마네킹을 나처럼 꾸며 보세요
              </h2>
              <p className={styles.darkLead}>얼굴형, 피부 톤, 머리 모양, 안경을 골라서 완성했을 때의 모습을 나와 비슷하게 볼 수 있어요. 골라 보는 건 누구나 할 수 있고, 저장은 플러스에서 됩니다.</p>
              <Link href="/mannequin" className={styles.darkLink}>
                꾸미기 화면 보기
              </Link>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.last}`} aria-labelledby="start-title">
          <div className={`${styles.inner} ${styles.start}`}>
            <div className={styles.startRow}>
              <div className={styles.startText}>
                <h2 id="start-title" className={styles.h2}>
                  가지고 있는 도안으로 시작해 보세요
                </h2>
                <Link href="/upload" className={styles.cta}>
                  PDF 도안 올리기
                </Link>
              </div>
              <Mascot size={176} className={styles.startMascot} />
            </div>
            <p className={styles.copyright}>도안의 저작권은 디자이너에게 있어요. {BRAND}에서는 올린 사람만 볼 수 있는 페이지를 만들고, 도안 내용을 다른 사람에게 공개하지 않습니다.</p>
          </div>
        </section>
      </main>
    </>
  )
}

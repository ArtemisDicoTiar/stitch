import styles from './Upload.module.css'

const Check = () => (
  <svg className={styles.check} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

/** 올리기와 읽는 중 화면 옆에 놓는 안내: 잘 읽는 도안, 비공개 원칙 */
export function UploadAside() {
  return (
    <aside className={styles.aside}>
      <section className={styles.sideCard} aria-labelledby="reads-well">
        <h2 id="reads-well" className={styles.sideTitle}>
          이런 도안을 잘 읽어요
        </h2>
        <ul className={styles.goodList}>
          <li>
            <Check />
            대바늘 도안과 코바늘 도안
          </li>
          <li>
            <Check />
            단마다 글로 적힌 지시문
          </li>
          <li>
            <Check />
            한글과 영문 약어 (k2tog, ssk, sc, dc 등)
          </li>
        </ul>
        <p className={styles.soon}>코바늘은 인형·소품, 목도리·블랭킷, 가방·모자 도안을 읽어요. 구멍 무늬나 모티브가 많은 도안은 읽은 뒤 확인할 곳이 더 많을 수 있어요.</p>
        <h3 className={styles.hardTitle}>아직은 어려워요</h3>
        <ul className={styles.hardList}>
          <li>사진이나 손글씨로만 된 도안</li>
          <li>차트 그림만 있고 글이 없는 도안</li>
        </ul>
      </section>
      <section className={styles.privacy} aria-labelledby="private-note">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <div className={styles.privacyBody}>
          <strong id="private-note">올린 도안은 나만 볼 수 있어요</strong>
          <span>PDF는 비공개 저장소에 보관하고, 올린 사람만 열 수 있어요. 만들어진 페이지에는 공유 링크가 생기지 않아요.</span>
          <span>도안을 읽는 단계에서는 PDF가 LLM 제공자(Claude API)에게 전송됩니다.</span>
          <span>도안의 저작권은 디자이너에게 있습니다.</span>
        </div>
      </section>
    </aside>
  )
}

// JSON을 import 해서 함수 번들에 포함시킨다 (파일 경로에 의존하지 않음)
import keywordsJson from '../config/keywords.json' with { type: 'json' }
import settings from '../config/settings.json' with { type: 'json' }

export function loadKeywords() {
  const k = keywordsJson.keywords ?? []
  if (!k.length) throw new Error('config/keywords.json 에 키워드가 없습니다')
  if (k.length > 90) throw new Error(`키워드 ${k.length}개: 90개 이하로 줄여 주세요`)
  return k
}
export const loadSettings = () => settings

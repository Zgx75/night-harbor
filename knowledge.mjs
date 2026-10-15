// Reviewed source summaries, accessed 2026-10-15; not copied full articles.
export const knowledge = [
  { id: 'K1', title: '咖啡因與睡眠', publisher: 'NIH · NHLBI', tags: ['咖啡', '咖啡因', '茶', '能量飲料', 'caffeine', 'coffee'], url: 'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits', text: '咖啡因可能干擾睡眠，影響可持續達八小時。下午較晚喝咖啡可能使夜間較難入睡；影響有個人差異，不能單憑飲用時間確定原因。' },
  { id: 'K2', title: '作息一致與睡前環境', publisher: 'NIH · NHLBI', tags: ['作息', '週末', '假日', '燈光', '手機', '螢幕', '調暗', '生理時鐘', '睡眠', 'sleep', 'schedule'], url: 'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits', text: '盡量維持每天相近的就寢與起床時間；平日與假日差距宜控制在約一小時內。睡前一小時可安排安靜活動，減少明亮人造光，臥室維持安靜、涼爽、昏暗。' },
  { id: 'K3', title: '晚間運動的時間與強度', publisher: 'Stutz 等 · Sports Medicine（2019）', tags: ['運動', '健身', '重訓', '肌肉', '恢復', '跑步', 'exercise', 'workout'], url: 'https://pubmed.ncbi.nlm.nih.gov/30374942/', text: '這篇健康成人研究的統合分析，整體不支持晚間運動必然妨礙睡眠。但睡前一小時內結束的劇烈運動可能不利部分睡眠指標。不能由此推算重訓者個人的最佳睡眠時數，或認定某次失眠的原因。' },
  { id: 'K4', title: '讓擔心與待辦有地方安放', publisher: 'NHS · Every Mind Matters', tags: ['焦慮', '壓力', '擔心', '心情', '情緒', '待辦', '報告', '報復', '放鬆', 'stress', 'worry'], url: 'https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-fall-asleep-faster-and-sleep-better/', text: 'NHS 建議可與信任的人談談，或寫下擔憂。如果常在床上想事情，可在睡前列出隔天的待辦，幫助整理思緒。生活策略不等同疾病治療。' },
  { id: 'K5', title: '成人睡眠時數與紀錄', publisher: 'CDC', tags: ['時數', '幾小時', '疲勞', '累', '起床', '入睡', '睡眠', 'sleep', 'hours'], url: 'https://www.cdc.gov/sleep/about/index.html', text: 'CDC 對十八至六十歲成人的建議為每晚至少七小時，睡眠品質也很重要。紀錄就寢、起床、咖啡因及運動資訊有助了解習慣；就寢到起床的區間不等於真正睡著的時數。' },
  { id: 'K6', title: '褪黑激素與營養品的證據限制', publisher: 'NIH · NCCIH', tags: ['褪黑', '營養品', '保健', '補充', '藥', '鎂', 'melatonin', 'supplement'], url: 'https://www.nccih.nih.gov/health/melatonin-what-you-need-to-know', text: '褪黑激素並不適合所有睡眠問題。慢性失眠的有效性與安全性證據不足以支持普遍使用，長期安全性仍不明，也可能與藥物交互作用。應與醫療專業人員討論，不由本系統決定種類、劑量或服用時間；不能把這些資料當成其他營養品有效的證據。' },
  { id: 'K7', title: '晨間與晚間運動的比較', publisher: 'Souabni 等 · Sleep Medicine Reviews（2026）', tags: ['運動', '健身', '重訓', '晨間', '夜間', '恢復', 'exercise', 'workout'], url: 'https://pubmed.ncbi.nlm.nih.gov/42632303/', text: '這篇系統性回顧未顯示晨間運動對多數睡眠結果有一致的整體優勢。晚間運動與睡眠連續性的差異可能受強度、距離就寢時間及個人因素影響，也有小型研究效應等限制，不宜一概禁止晚上運動。' }
,
  { id:'K8',title:'睡前螢幕與自我睡眠評分',publisher:'CDC',tags:['螢幕','手機','滑','screen','評分','品質'],url:'https://www.cdc.gov/sleep/about/index.html',text:'CDC 建議睡前至少三十分鐘關閉電子裝置。睡眠品質也包括是否連續、醒來後是否有恢復感。自評分數可幫助觀察變化，不能當成疾病診斷；沒有填寫不代表睡得差。' },
  { id:'K9',title:'午睡與夜間入睡',publisher:'NIH · NHLBI',tags:['午睡','打盹','小睡','nap'],url:'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits',text:'午睡可能增加日間清醒度，但若夜間難入睡，NHLBI 建議限制午睡或安排在下午較早時段，成人午睡不超過二十分鐘。需考量個人情況，不能只憑一次午睡認定夜間睡不著的原因。' }
].map(item => ({ ...item, reviewedAt: '2026-10-15' }));
function tokens(value) {
  const s = value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
}
export function retrieve(query, limit = 4) {
  const input = query.toLowerCase(), q = tokens(query);
  return knowledge.map(item => {
    const t = tokens(item.title + item.text);
    const score = item.tags.reduce((n, tag) => n + (input.includes(tag.toLowerCase()) ? 6 : 0), 0) + [...q].filter(s => t.has(s)).length * 0.3;
    return { ...item, score };
  }).filter(s => s.score >= 1).sort((a, b) => b.score - a.score).slice(0, limit);
}

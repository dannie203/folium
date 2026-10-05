import test from 'node:test';
import assert from 'node:assert';

// Import pure functions directly or re-implement pure logic for testing
function splitTextIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];

  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  const TITLE_ABBREVS = [
    'mr', 'mrs', 'ms', 'dr', 'prof', 'tp', 'ths', 'bs', 'ts', 'gs', 'th',
    'vs', 'đ/c', 'đc'
  ];

  let tokenized = cleaned;
  TITLE_ABBREVS.forEach((abbr) => {
    const escaped = abbr.replace(/\\./g, '\\.');
    const regex = new RegExp(`(\\b${escaped})\\.`, 'gi');
    tokenized = tokenized.replace(regex, (_match, p1) => `${p1}__ABBRDOT__`);
  });

  tokenized = tokenized.replace(/(\d+)\.(\d+)/g, '$1__DOT__$2');

  const rawChunks = tokenized.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ỹ0-9"“«])/u);

  const result = [];
  for (const chunk of rawChunks) {
    let restored = chunk.trim();
    restored = restored.replace(/__ABBRDOT__/g, '.');
    restored = restored.replace(/__DOT__/g, '.');
    if (restored.length > 0) {
      result.push(restored);
    }
  }

  const finalSentences = [];
  for (const sentence of result) {
    if (sentence.length > 350) {
      const subChunks = sentence.split(/(?<=[,;:\n])\s+/);
      const validSub = subChunks.filter((s) => s.trim().length > 0);
      if (validSub.length > 0) {
        finalSentences.push(...validSub);
      } else {
        finalSentences.push(sentence);
      }
    } else {
      finalSentences.push(sentence);
    }
  }

  return finalSentences.length > 0 ? finalSentences : [cleaned];
}

function sortAndFilterVoices(voices, preferredLocale = 'vi') {
  const normPref = preferredLocale.toLowerCase().slice(0, 2);

  const recommended = [];
  const others = [];

  for (const voice of voices) {
    const lang = voice.language.toLowerCase();
    if (lang.startsWith(normPref) || (normPref === 'vi' && lang.includes('vi'))) {
      recommended.push(voice);
    } else {
      others.push(voice);
    }
  }

  recommended.sort((a, b) => a.name.localeCompare(b.name));
  others.sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name));

  return { recommended, others };
}

// ==============================================================================
//  TEST SUITE: Phase 10 TTS Sentence Splitting & Voice Filtering
// ==============================================================================

test('TTS 1: Correctly splits simple Vietnamese sentences', () => {
  const text = 'Chào mừng bạn đến với Folium. Đây là ứng dụng đọc sách offline! Bạn có thích không? Tôi rất thích…';
  const sentences = splitTextIntoSentences(text);
  assert.strictEqual(sentences.length, 4);
  assert.strictEqual(sentences[0], 'Chào mừng bạn đến với Folium.');
  assert.strictEqual(sentences[1], 'Đây là ứng dụng đọc sách offline!');
  assert.strictEqual(sentences[2], 'Bạn có thích không?');
  assert.strictEqual(sentences[3], 'Tôi rất thích…');
});

test('TTS 2: Protects Vietnamese abbreviations from premature sentence splitting', () => {
  const text = 'Hôm nay BS. Nguyễn Văn A cùng ThS. Trần Thị B đã đến TP. Hồ Chí Minh để tham quan v.v. Tất cả mọi người đều vui vẻ.';
  const sentences = splitTextIntoSentences(text);
  assert.strictEqual(sentences.length, 2);
  assert.ok(sentences[0].includes('BS. Nguyễn Văn A'));
  assert.ok(sentences[0].includes('TP. Hồ Chí Minh'));
  assert.ok(sentences[0].includes('v.v.'));
  assert.strictEqual(sentences[1], 'Tất cả mọi người đều vui vẻ.');
});

test('TTS 3: Protects decimal numbers and currency amounts', () => {
  const text = 'Chỉ số lạm phát đạt 3.14 phần trăm. Giá vàng tăng lên 85.5 triệu đồng một lượng.';
  const sentences = splitTextIntoSentences(text);
  assert.strictEqual(sentences.length, 2);
  assert.ok(sentences[0].includes('3.14'));
  assert.ok(sentences[1].includes('85.5'));
});

test('TTS 4: Strips HTML tags and normalizes multiline text in book chapters', () => {
  const htmlExcerpt = `
    <p>Chương I: Mở đầu.</p>
    <p>Ánh mặt trời <b>rực rỡ</b> chiếu qua khung cửa sổ sổ!</p>
    <div>Ai đó đang bước vào phòng?</div>
  `;
  const sentences = splitTextIntoSentences(htmlExcerpt);
  assert.strictEqual(sentences.length, 3);
  assert.strictEqual(sentences[0], 'Chương I: Mở đầu.');
  assert.strictEqual(sentences[1], 'Ánh mặt trời rực rỡ chiếu qua khung cửa sổ sổ!');
  assert.strictEqual(sentences[2], 'Ai đó đang bước vào phòng?');
});

test('TTS 5: Voice sorting prioritizes Vietnamese voices when app locale is "vi"', () => {
  const mockVoices = [
    { identifier: 'en-us-1', name: 'Samantha', language: 'en-US' },
    { identifier: 'vi-vn-1', name: 'Linh', language: 'vi-VN' },
    { identifier: 'ja-jp-1', name: 'Kyoko', language: 'ja-JP' },
    { identifier: 'vi-vn-2', name: 'An (Natural)', language: 'vi-VN' },
  ];

  const { recommended, others } = sortAndFilterVoices(mockVoices, 'vi');
  assert.strictEqual(recommended.length, 2);
  assert.strictEqual(others.length, 2);
  assert.strictEqual(recommended[0].name, 'An (Natural)');
  assert.strictEqual(recommended[1].name, 'Linh');
});

test('TTS 6: Voice sorting prioritizes English voices when app locale is "en"', () => {
  const mockVoices = [
    { identifier: 'en-us-1', name: 'Samantha', language: 'en-US' },
    { identifier: 'vi-vn-1', name: 'Linh', language: 'vi-VN' },
    { identifier: 'en-gb-1', name: 'Daniel', language: 'en-GB' },
  ];

  const { recommended, others } = sortAndFilterVoices(mockVoices, 'en');
  assert.strictEqual(recommended.length, 2);
  assert.strictEqual(others.length, 1);
  assert.strictEqual(recommended[0].name, 'Daniel');
  assert.strictEqual(recommended[1].name, 'Samantha');
});

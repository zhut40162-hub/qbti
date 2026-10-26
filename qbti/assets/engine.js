(function () {
  'use strict';
  var data = window.QBTI_DATA;
  var mains = data.questions.filter(function (q) { return q.kind === 'main'; });
  var minimumForClosest = Math.ceil(mains.length / 2);
  function normalize(raw) {
    var result = {};
    raw = raw && typeof raw === 'object' ? raw : {};
    mains.forEach(function (q) {
      var v = raw[q.id];
      if (typeof v === 'number' && Math.floor(v) === v && v >= 0 && v < q.options.length) { result[q.id] = v; }
    });
    return result;
  }
  function matches(answer, expected) {
    return Array.isArray(expected) ? expected.indexOf(answer) !== -1 : answer === expected;
  }
  function rank(a, b) {
    return b.hits * a.total - a.hits * b.total || b.hits - a.hits || a.order - b.order;
  }
  function score(raw) {
    var answers = normalize(raw);
    var answeredCount = Object.keys(answers).length;
    var eligible = [];
    data.profiles.forEach(function (p, order) {
      var rule = data.rules[p.id];
      var keys = Object.keys(rule.signals);
      var matched = keys.filter(function (key) { return matches(answers[key], rule.signals[key]); });
      // Required choices define these personas; a closest match cannot bypass them.
      if (!matched.length || (rule.required && !rule.required.every(function (key) { return matched.indexOf(key) !== -1; }))) { return; }
      eligible.push({profileId:p.id,hits:matched.length,total:keys.length,matched:matched,order:order});
    });
    var candidates = eligible.filter(function (candidate) { return candidate.hits >= 3 && candidate.hits / candidate.total >= 0.6; });
    var mode = 'matched';
    // Mixed preferences are normal. A sufficiently answered quiz still gets its
    // best supported persona when no exact pattern passes the strong-match gate.
    if (!candidates.length && answeredCount >= minimumForClosest) { candidates = eligible; mode = 'closest'; }
    candidates.sort(rank);
    var baseNote = '这份结果是你对感情偏好的趣味侧写，不代表已经发生的经历，也不是固定的人格定论。';
    if (!candidates.length) {
      return {profileId:null,mode:'insufficient',evidence:[],note:'这次可参考的选择较少，还无法匹配明确的人格类型。感情维度会展示目前能判断的范围。'};
    }
    var winner = candidates[0];
    var evidence = winner.matched.map(function (id) {
      var q = mains.filter(function (item) { return item.id === id; })[0];
      return q.text + ' → ' + q.options[answers[id]].text;
    });
    var note = baseNote;
    if (mode === 'closest') { note += ' 你的选择里有不同倾向，这次展示其中最接近的一类，不需要每句都对上。'; }
    if (candidates.length > 1 && winner.hits * candidates[1].total === candidates[1].hits * winner.total) {
      note += ' 有多个侧面同样突出；此处按一致信号数、再按固定类型顺序选一个外号，不表示只能属于这一类。';
    }
    return {profileId:winner.profileId,mode:mode,evidence:evidence,note:note};
  }
  function dimensions(raw, revision) {
    var answers = normalize(raw);
    revision = revision || {};
    var currentRevision = data.questionnaireRevision || 1;
    var answerRevision = typeof revision.answerRevision === 'number' ? revision.answerRevision : currentRevision;
    var questionRevisions = revision.questionRevisions || {};
    return (data.dimensions || []).map(function (dimension) {
      var keys = Object.keys(dimension.signals);
      var sum = 0;
      var answered = 0;
      var uncertain = 0;
      keys.forEach(function (key) {
        var answer = answers[key];
        // A skipped/missing answer may point to either end, so retain its possible range.
        if (answer === undefined) { uncertain++; return; }
        var values = dimension.signals[key];
        var itemRevision = typeof questionRevisions[key] === 'number' ? questionRevisions[key] : answerRevision;
        if (itemRevision < currentRevision && dimension.legacySignals && dimension.legacySignals[key]) {
          values = dimension.legacySignals[key];
        }
        var value = values[answer];
        if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 100) {
          // An old ambiguous direct answer remains uncertain; unrelated choices do not vote.
          if (key === dimension.anchorQuestionId) { uncertain++; }
          return;
        }
        sum += value;
        answered++;
      });
      var count = answered + uncertain;
      var value = !uncertain && answered ? Math.round(sum / answered) : null;
      var low = value !== null ? value : count ? Math.floor(sum / count) : 0;
      var high = value !== null ? value : count ? Math.ceil((sum + uncertain * 100) / count) : 100;
      return {id:dimension.id,label:dimension.label,lowLabel:dimension.lowLabel,highLabel:dimension.highLabel,value:value,low:low,high:high,answered:answered,uncertain:uncertain,total:keys.length};
    });
  }
  window.QBTI_ENGINE = {score:score,normalize:normalize,dimensions:dimensions};
}());

"""Phase 5.3 Stage 3: scores clause records from rules-v19, wink-nlp and compromise against independent labels.
One shared mapping turns every system's clause records into the label fields, so only the sentence analysis differs."""

import json, re, collections, sys

D = "C:/Users/slayf/AppData/Local/Temp/claude/09f11a5caec5af2c/ac07aabb-7520-4199-b003-a87e9b15270b/scratchpad/parser-eval/"
corpus = {i["id"]: i for i in json.load(open(D + "corpus.json", encoding="utf-8"))["items"]}
labels = {}
for f in ("labels_a.json", "labels_b.json"):
    for l in json.load(open(D + f, encoding="utf-8"))["labels"]:
        labels[l["id"]] = l
parsed = json.load(open(D + "parsed.json", encoding="utf-8"))
rules = json.load(open(D + "rules.json", encoding="utf-8"))["rules"]
systems = {
    "rules-v19": {k: v["clauses"] for k, v in rules.items()},
    "wink-nlp": parsed["wink"],
    "compromise": parsed["compromise"],
    "hybrid (rules clauses + compromise subjects)": parsed["hybrid"],
}

# The scenario type of each opened item, for the known-failure slices.
types = {}
for d in ("m11_followup2", "m11_followup3"):
    for s in json.load(
        open(
            f"C:/Users/slayf/OneDrive/Desktop/CareerOS/web/tests/fixtures/{d}/scenarios.json",
            encoding="utf-8",
        )
    )["scenarios"]:
        types[f"{d}:{s['id']}"] = s["type"]

STOP = set(
    "the a an and or of to in on at for with by from as is are was were be been being this that these those it its i we you he she they my our your their his her experience years year work working skills ability strong proficiency knowledge using use".split()
)
stem = lambda w: w.lower()[:5]


def terms(t):
    return {stem(w) for w in re.findall(r"[A-Za-z][A-Za-z'-]{3,}", t) if w.lower() not in STOP}


SUPERVISE = {
    "manag",
    "overs",
    "super",
    "lead",
    "led",
    "assig",
    "sched",
    "appro",
    "hire",
    "hired",
    "deleg",
    "direc",
    "ensur",
    "coord",
}
REQUEST = {"reque", "call", "conta", "order", "book", "submi", "email"}
ASSIST = {"help", "assis", "suppo", "hand", "prep", "fetch", "hold"}
OBSERVE = {"watch", "obser", "shado", "sit", "sat"}


def verb_involvement(v):
    s = stem(v) if v else ""
    if s in SUPERVISE:
        return "supervised"
    if s in REQUEST:
        return "requested"
    if s in ASSIST:
        return "assisted"
    if s in OBSERVE:
        return "observed"
    return "performed"


CORRECTION = re.compile(
    r"(?:^|[.!?;,]\s*)(?:well|actually|i\s+mean|to\s+be\s+honest|honestly)\b[^.!?;]*\b(?:not|only|just|mostly|never|n't)\b",
    re.I,
)


def read(item, clauses):
    req = terms(item["requirement"])
    rel = [c for c in clauses if terms(c["text"]) & req] or clauses
    inv = lambda c: c.get("involvement") or verb_involvement(c["verb"])
    self_perf = any(c["subject"] == "self" and inv(c) == "performed" and not c["negated"] for c in rel)
    self_any = [c for c in rel if c["subject"] == "self"]
    other = any(c["subject"] == "other" and not c["passive"] for c in rel)
    team = any(c["subject"] == "team" for c in rel)
    passive = any(c["passive"] for c in clauses)
    negated = any(c["negated"] and c["subject"] in ("self", "none") for c in rel)
    if self_perf and other:
        actor = "mixed"
    elif self_perf:
        actor = "self"
    elif other:
        actor = "other"
    elif team:
        actor = "team"
    elif passive:
        actor = "unclear"
    else:
        actor = "none"
    involvement = "performed" if self_perf else (inv(self_any[0]) if self_any else "none")
    classes = [
        c["subject"] for c in clauses if c["subject"] in ("self", "team", "other") and not c["passive"]
    ]
    multiple = len(set(classes)) >= 2 or classes.count("other") >= 2
    related = bool(terms(" ".join(c["text"] for c in clauses)) & req)
    own = "no"
    if self_perf and related and not negated:
        own = "partial" if (other or team) else "yes"
    elif team and related and not negated:
        own = "partial"
    return {
        "actor": actor,
        "involvement": involvement,
        "passive": passive,
        "negated": negated,
        "multiple_actors": multiple,
        "correction": bool(CORRECTION.search(item["text"])),
        "ownership": own,
    }


def f1(pairs):
    tp = sum(1 for p, g in pairs if p and g)
    fp = sum(1 for p, g in pairs if p and not g)
    fn = sum(1 for p, g in pairs if not p and g)
    pr = tp / (tp + fp) if tp + fp else 0
    rc = tp / (tp + fn) if tp + fn else 0
    return f"F1 {2 * pr * rc / (pr + rc) if pr + rc else 0:.2f} (P {pr:.2f} R {rc:.2f})"


def credited(v):
    return v in ("yes", "partial")


ids = [i for i in corpus if i in labels]
print("labelled items", len(ids), "of", len(corpus))
report = {}
for name, data in systems.items():
    preds = {i: read(corpus[i], data[i]) for i in ids}
    acc = lambda f, sub=None: sum(preds[i][f] == labels[i][f] for i in (sub or ids)) / len(sub or ids)
    false_own = [i for i in ids if credited(preds[i]["ownership"]) and labels[i]["ownership"] == "no"]
    missed = [i for i in ids if not credited(preds[i]["ownership"]) and credited(labels[i]["ownership"])]
    report[name] = {
        "actor_acc": acc("actor"),
        "involvement_acc": acc("involvement"),
        "false_ownership": len(false_own),
        "missed_ownership": len(missed),
    }
    print(f"\n== {name}")
    print(
        f"  who did the work (actor) accuracy {acc('actor'):.2f}; involvement accuracy {acc('involvement'):.2f}"
    )
    for f in ("passive", "negated", "multiple_actors", "correction"):
        print(f"  {f:16} {f1([(preds[i][f], labels[i][f]) for i in ids])}")
    print(f"  ownership: false attribution {len(false_own)}, missed legitimate {len(missed)}")
    for kind in ("answer", "reply", "role_description"):
        sub = [i for i in ids if corpus[i]["kind"] == kind]
        print(
            f"    {kind:16} n={len(sub):3} actor {acc('actor', sub):.2f}  false own {sum(1 for i in sub if i in false_own):3}  missed {sum(1 for i in sub if i in missed):3}"
        )
    conf = collections.Counter((labels[i]["actor"], preds[i]["actor"]) for i in ids)
    print(
        "  actor confusion (label -> predicted), top errors:",
        [(k, n) for k, n in conf.most_common(30) if k[0] != k[1]][:8],
    )
    hard = collections.defaultdict(lambda: [0, 0])
    for i in ids:
        t = types.get(":".join(corpus[i]["src"].split(":")[:2]), corpus[i]["kind"])
        if t in (
            "delegated_or_supervised",
            "supervised",
            "requested_from_provider",
            "handed_off",
            "assisted",
            "assisted_or_observed",
            "observed",
            "colleague_did",
            "mixed_ownership",
            "ambiguous_subject",
            "corrects_itself",
            "role_description",
        ):
            hard[t][0] += 1
            hard[t][1] += preds[i]["actor"] == labels[i]["actor"]
    print("  hard slices (actor right / n):", {k: f"{v[1]}/{v[0]}" for k, v in sorted(hard.items())})

# rules-v19 as the product reads it: the answer reader, the reply reader, and the engine for role descriptions.
prod = {i: rules[i]["product"] for i in ids}
fo = [i for i in ids if credited(prod[i]) and labels[i]["ownership"] == "no"]
mi = [i for i in ids if not credited(prod[i]) and credited(labels[i]["ownership"])]
print(f"\n== rules-v19 product verdicts: false ownership {len(fo)}, missed legitimate {len(mi)}")
for kind in ("answer", "reply", "role_description"):
    sub = [i for i in ids if corpus[i]["kind"] == kind]
    print(
        f"    {kind:16} false {sum(1 for i in sub if i in fo):3}  missed {sum(1 for i in sub if i in mi):3}"
    )
ws = [i for i in ids if corpus[i]["kind"] == "role_description"]
print("  role descriptions labelled word_sense:", collections.Counter(labels[i]["word_sense"] for i in ws))
print(
    "  role descriptions with a different sense that the product credits:",
    [corpus[i]["src"] for i in ws if labels[i]["word_sense"] == "different" and credited(prod[i])],
)
json.dump(report, open(D + "scores.json", "w"), indent=1)

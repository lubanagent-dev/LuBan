# Write Business Tools

Implement business lookups and writes as Python tools, configure risk tiers, and verify human approval. Prerequisites: an agent created and a callable real model. The business API's permissions, validation, and idempotency logic are the tool implementer's responsibility.


## 1. Approach: the model speaks, the code acts

[Agent concepts](./00-primer.md) covered the division of labor; here is the implementation view. A tool in LubanAgent is just **an ordinary Python function plus decorator-declared metadata**:

```python
@tool(key="my_lib_lookup", description="按学号查询借阅记录。",
      risk=RiskLevel.LOW, timeout_seconds=10.0, idempotent=True)
def my_lib_lookup(student_id: str) -> dict:
    """查借阅记录。"""
    ...
```

No base class, no interface, no registry file — any ordinary function with the decorator is a tool. What do you "register" with the framework? Nothing: importing is registering (in step 1 you'll see that the import line in `__init__.py` is the entire registration action).

The key is **how the framework lets the model know the tool exists**: at runtime the tool list (names, descriptions, parameter structure) is sent to the model — the parameters' JSON Schema is **auto-generated** from the function signature: `student_id: str` becomes `{"type": "string"}`. Emphasis: the parameter information the model can see is **only names and types**. Parameter explanations written in the docstring are for humans — notes to future-you maintaining this code; the model never sees them. After reading the list, the model decides to call and outputs structured data (tool name + argument values); the framework parses it, actually calls your function, and feeds the return value back to the model to compose the answer.

So your only "interface design" work when writing a tool is: **the function signature**. Argument names must be semantically clear (the model can't see descriptions, it guesses entirely from names), and type annotations are required (the model relies on them to produce correctly typed values).

Who each governance parameter serves:

- `risk`: risk tier. `LOW` (read-only, execute directly) / `MEDIUM` / `HIGH` (approval required by default).
- `approval_required`: explicitly declare human approval. **HIGH or approval_required — either being true enters the approval gate** — approval is enforced by code, not model self-discipline.
- `idempotent`: idempotency. It is the **precondition** for automatic retry, not a switch — only idempotent tools are ever retried, and you must also set `max_retries` above 0 for retries to actually happen (default 0: zero attempts; this page's lookup doesn't set it, so failure returns failure immediately). Retrying a non-idempotent operation like charging or loss-reporting means double charging — never enable it there.
- `timeout_seconds`: per-execution timeout. Prevents a tool from hanging the whole conversation.

The four parameters in one table make the two tools' tiering instantly clear:

| Governance parameter | my_lib_lookup | my_lib_report_loss | Reason for the difference |
|---|---|---|---|
| `risk` | LOW | HIGH | Read-only query vs. a fee-charging action |
| `approval_required` | unset (no approval) | True | Queries need no human nod; charging does |
| `idempotent` | True | False | Same query, same result; a loss report is irreversible |
| `timeout_seconds` | 10.0 | 15.0 | Both prevent hangs; the money path gets a bit more slack |

How to read this table matters more than the table: every "reason" row points at a business fact, not a parameter default. When you set governance parameters for any future tool, ask the same format of question — a parameter whose "reason" you can't answer is a parameter you haven't thought through.

One more subtle but important mechanism: **signature freezing**. A hash of the tool's parameter structure is recorded into the agent's version snapshot; if you later change the tool's signature (say, add a parameter), the old agent version reports "signature drift" and refuses to run — preventing silent chaos like "the definition says two arguments, the code wants three". When you hit it, re-run init once to produce a new version.

On first sight this mechanism feels like "over-engineering"; it exists to prevent parameter signatures from diverging from registered metadata.

### The complete journey of one tool call

Expand the two event-stream frames from [Connect real models](./03-real-models.md) and walk the whole path from the model's view to the code's view:

1. **List delivery**: at Run start, the framework compiles all tools mounted on the agent into a list (names, descriptions, auto-generated parameter JSON Schemas) and sends it to the model;
2. **Model decision**: the model reads the user input, decides which tool to call and with what arguments, and outputs structured data (tool name + argument values);
3. **Governance check**: the framework receives the data and first checks risk tier and approval declarations — what must be blocked is blocked here (the `tool.approval.requested` you saw in [Connect real models](./03-real-models.md) is emitted at this link);
4. **Real execution**: checks pass; the framework parses arguments and calls your Python function — `tool.started` fires at this moment;
5. **Result feedback**: the returned dict goes back to the model verbatim, which phrases it into a human answer — `tool.finished` closes it out.

Of the five links, the model participates only in links 2 and 5. Links 3 and 4 are pure code — the approvals, timeouts, and retries you can trust all live where the model can't reach.

### Why the framework is designed this way

Four design points, each answering a class of real incident:

**Why generate the parameter Schema from the signature instead of asking you to hand-write JSON Schema?** Because an interface can only have one source of truth. A hand-written Schema means the same parameter structure exists twice — function signature and Schema — and forgetting to update one after editing the other leaves the model filling arguments against a stale structure, exploding at runtime in baffling ways. Generated from the signature, "code is the interface" and the Schema always matches the function; the workbench's parameter Schema (step 3's checkpoint) is exactly this generated artifact. The cost is accepting a constraint: want to give the model more parameter info? You can't — only names and types — so argument names must read like documentation.

**Why is retry default 0 and premised on idempotency?** Think about when retries fire: tool timeout, network jitter, downstream 5xx. If the tool is "charge 100 yuan" and the first request actually succeeded but the response was lost, a retry charges another 100. **Retry is life-saving for idempotent operations and double-charging for non-idempotent ones** — the framework can't tell which is which, so the decision stays in the declaration: `idempotent=True` is the qualification, `max_retries>0` is the intent; both must hold before any retry. Defaulting both off is the safest default.

**Why is approval a code gate instead of prompting the model to "ask the user before spending"?** You saw half the answer in [Connect real models](./03-real-models.md) step 6: the model is a probability system; prompt constraints are requests, not enforcement, and can always be talked around — especially with crafted inputs. The approval gate sits on the tool declaration (`approval_required=True`), and the framework checks it **before execution** — if unmet, it suspends and waits for a human. The model never even gets the chance to "attempt execution", so there's nothing to "persuade".

**Why is the risk tier declared at the tool rather than a global approval policy ("approve all writes", say)?** Because "how dangerous is this" is business knowledge only the tool's author knows. `refund_apply` charges money, so it needs approval; `query_order` is read-only, so it doesn't — this judgment doesn't survive abstraction away from the specific tool. Put it in a global policy and it's either too coarse (blocking harmless operations) or too fine (the policy file grows into a second business logic). Tiering at the tool keeps approval granularity aligned with business risk granularity.

## 2. Steps

Five steps in one straight line: create the package → write two tools → mount → unit-test → validate in conversation. Keep the order — especially step 4's online test-run before step 5's conversation: verify the tool itself first, then model dispatch; always troubleshoot layer by layer.

### Step 1: Create the tool package

```bash
mkdir -p app/tools/my_library
```

Create `app/tools/my_library/__init__.py`:

```python
from . import lookup, report_loss  # 导入即注册
```

Create `app/tools/my_library/lookup.py`:

```python
"""查借阅记录（低风险只读工具）。"""

from lubanagent.core import RiskLevel
from lubanagent.extension import tool

# 教程演示用内置数据；真实场景换成 HTTP 调用你的业务系统，
# 模式照抄 app/tools/customer_service/order.py。
_BORROWS: dict[str, list[dict]] = {
    "2023011234": [
        {"title": "三体", "due": "2026-09-20", "renewals_left": 1},
        {"title": "机器学习系统设计", "due": "2026-09-12", "renewals_left": 0},
    ],
}


@tool(
    key="my_lib_lookup",
    description="按学号查询借阅记录（书名/应还日期/剩余续借次数）。",
    risk=RiskLevel.LOW,
    timeout_seconds=10.0,
    idempotent=True,
)
def my_lib_lookup(student_id: str) -> dict:
    """查借阅记录。

    参数: student_id: 学号（如 2023011234）
    """
    records = _BORROWS.get(student_id, [])
    return {"student_id": student_id, "count": len(records), "records": records}
```

(The data is hard-coded in the module — this page saves its attention for the tool mechanism. In real scenarios, replace it with an HTTP call to your business system — a single `httpx` GET — modeled on `app/tools/customer_service/order.py` from the further reading at the end. The fixtures above read: 三体 = *The Three-Body Problem*; 机器学习系统设计 = *ML Systems Design*; title/due/renewals_left = book title, due date, remaining renewals.)

Two things to notice while reading this code. First, the docstring's "参数: student_id: 学号" — remember question 1 from the opening? The model **cannot see** that text; it's written for future-you. The model sees only the argument name `student_id` and type `str`. The name is good (anyone sees it's a student ID), so the model won't fill it wrong. Second, the return value is a dict — the model sees exactly what the tool returns, so the returned structure must be self-explanatory (`count`, `records` — those key names are the field documentation the model reads).

 Checkpoint: `grep -c "@tool" app/tools/my_library/lookup.py` outputs 1.

This checkpoint verifies more than "the decorator was written" — it also verifies "on the function, not in a comment": grep counts decorator instances in code, so paste omissions and indentation slips surface here, not after a service-restart scan error.

### Step 2: Write the high-risk tool

Create `app/tools/my_library/report_loss.py`:

```python
"""校园卡挂失（高风险工具：收工本费、触发人工审批）。"""

from lubanagent.core import RiskLevel
from lubanagent.extension import tool

CARD_LOSS_FEE = 20.0  # 挂失补办工本费（元）


@tool(
    key="my_lib_report_loss",
    description=f"提交校园卡挂失申请（高风险：收工本费 {CARD_LOSS_FEE:g} 元，需人工审批）。",
    risk=RiskLevel.HIGH,
    timeout_seconds=15.0,
    idempotent=False,
    approval_required=True,
)
def my_lib_report_loss(student_id: str) -> dict:
    """挂失校园卡并生成补办申请。

    参数: student_id: 学号（如 2023011234）
    """
    return {
        "student_id": student_id,
        "status": "loss_reported",
        "fee": CARD_LOSS_FEE,
        "pickup": "三日后凭学生证到图书馆前台领新卡",
    }
```

Compare the two tools' declarations: lookup is `LOW + idempotent` (an idempotent query, qualified for retry), report_loss is `HIGH + approval_required + non-idempotent` (money is involved — halt for a human nod; on failure, no retry).

Those four declaration differences aren't style preferences — each is a tiering decision with a business reason: the loss report charges a real ¥20 fee → approval required; the loss-report action is irreversible (you can't "un-report" to restore the old card) → non-idempotent, never retry; the query is read-only and always returns the same result → idempotent, retry-eligible. **Every line of governance parameters can answer "why"**.

Put yourself in the approver's chair once: if a loss report could execute without your nod, who is accountable for the ¥20 and the unrecoverable card? The approval chain isn't process overhead — it's the physical existence of a responsibility boundary: the code gate forcibly separates "the system wants to spend money" from "a human agreed to spend money". No AI system should let the model negotiate that boundary.

 Checkpoint: both files saved; the imports in `__init__.py` match the filenames (`lookup`, `report_loss`).

### Step 3: Mount them on 小图

In `app/agents/my_lib_assistant.yaml`, add a line after the instruction's service-scope section and add a `tools` section:

```yaml
instruction: |
  你是「小图」，学校图书馆的借阅服务助手，语气亲切像个耐心的学姐。
  服务范围：借阅记录查询、校园卡挂失、馆藏规章咨询。
  查借阅用 my_lib_lookup（要学号）；挂失用 my_lib_report_loss（收 20 元工本费，走人工审批）。
  边界：不处理图书采购建议、不提供文献代查，超出范围如实说明并建议到馆咨询前台。
brain: smart
tools: [my_lib_lookup, my_lib_report_loss]
memory: session
...
```

(Note that the persona also tells the model what each tool does and when to use it — the tool's `description` is also visible to the model, but usage rules in the persona make dispatch more stable.)

"More stable" deserves one expansion: the description answers "what is this tool", while persona rules answer "in which situations should it be used". Both enter the model's context, but the persona rules are dispatch instructions written for your business scenario — procedural requirements like "confirm the student ID before reporting a loss" can only be expressed in the persona.

Import and restart (tool registration happens during the service-startup scan, so new files require a restart to take effect):

```bash
.venv/bin/luban init
bash scripts/dev.sh restart
```

Expected result: init prints `my-lib-assistant@3` (or your current version +1); the workbench **Tools page** shows `my_lib_lookup` and `my_lib_report_loss`, and clicking one reveals the auto-generated parameter Schema.

The "freeze" of signature freezing just happened in front of you, in this very init.

From now on, every version number init prints can be read as one packaged "behavior snapshot": definition, tool signatures, and knowledge configuration pinned together at that moment. Versioning isn't bureaucracy — it's the infrastructure for rollback and comparison; the version-diff evals of [Evals and regression](./06-evals.md) are built on it.

### Step 4: Skip the conversation — unit-test the tool first

After writing tools, don't rush into conversation — every tool on the workbench Tools page has an **online test-run** (no Runtime, no model; executes the tool function directly):

```bash
curl -X POST http://localhost:8000/v1/tools/my_lib_lookup/test \
  -H "Content-Type: application/json" \
  -d '{"student_id": "2023011234"}'
```

Expected result: `{"success": true, "value": {"student_id": "2023011234", "count": 2, "records": [{"title": "三体", ...}, ...]}, ...}`.

Note the request body **is the arguments themselves** (not a wrapped `{"args": ...}`). This step verifies the tool function itself is correct — separating "the tool is broken" from "the model didn't call it right" is basic troubleshooting discipline. Whenever "the agent's tool usage seems off", your first move is always to run the test here: if the tool layer is right, the problem is on the model or orchestration side; if the tool layer is wrong, no amount of model-side digging helps.

### Step 5: Use the low-risk tool in conversation

In the debug console pick 小图, and type: `我是学号 2023011234 的学生，我借了哪些书？` ("I'm student 2023011234 — which books have I borrowed?")

Expected result: the reply contains 《三体》 (*The Three-Body Problem*) and 《机器学习系统设计》 (*ML Systems Design*) with their due dates — real data returned by the tool you just wrote. Watch the event stream via curl (or the debug console's tool status row): `tool.started` (the model decided to call my_lib_lookup) → `tool.finished` (real data back). From this moment, 小图 **cannot fabricate** on lending queries — every book it names comes from tool output.

"That can't fabricate" isn't rhetoric. The model's capability boundary is set by its context: lending data exists only in tool output, and there's nothing in context to fabricate from. The 小图 from the intro who "confidently invented book titles" and the 小图 in front of you differ by exactly this one tool.

### Step 6: Walk the loss-report approval

On the /chat page pick 小图, and type: `我的校园卡丢了，学号 2023011234，帮我挂失` ("My campus card is lost, student ID 2023011234 — please report it lost")

Expected result: **Approve / Reject buttons** appear inside the bubble (not direct execution) — my_lib_report_loss is high-risk; the gate halts for a human nod. Click **Approve**: the loss report executes for real, and the model goes on to tell you the ¥20 fee and the three-day pickup. In the event stream: `tool.approval.requested` → (your click) → `tool.approval.resolved`.

> You can also walk this chain with curl, but **don't add a short `--max-time` timeout**: the connection must stay open while waiting for your click — browsers do this naturally; curl with a timeout will cut the connection before you approve. A real, stepped-on pitfall.

In [Connect real models](./03-real-models.md) you used the built-in agent's refund approval; this time it's a tool you wrote and a risk tier you set — same gate mechanism, and you can now build the things it protects. Note one detail: from the `approval_required=True` line to the Approve/Reject buttons appearing in the bubble, you wrote **no frontend or workflow code whatsoever** — the approval UI, event stream, and suspend/resume are all the framework's. You declare risk; the framework executes the risk policy.

## 3. Validation

- [ ] The Tools page shows both my_lib tools with auto-generated Schemas
- [ ] The online test-run returns lending data directly (step 4)
- [ ] tool.started / tool.finished appear in conversation and the reply contains real data (step 5)
- [ ] The loss report walks Approve button → Approve → execution → fee notice (step 6)
- [ ] You can state why every governance-parameter difference between lookup and report_loss is set that way

The last item is this page's "go-live certificate": the first four verify operations; this one verifies judgment. If you can't articulate a difference's reason, re-read the comparison table in section 2 and the "why the framework is designed this way" section — a tool whose tiering rationale is unclear shouldn't reach production.

## 4. FAQ

This page's pitfalls share one theme: **you think you did it, the framework didn't see it**. Edited a file without importing it, changed a signature without init, the model claims it "did it" but the event stream shows nothing — all this class. One by one:

**Edited or added a tool; it's not on the Tools page.** Tool registration happens during the service-startup scan (driven by `EXTENSION_PACKAGES`, which by default scans the `app.tools` and `app.graphs` packages — tools and graphs are both discovered through it). Run `bash scripts/dev.sh restart`. Also check that `__init__.py` imports the new module — unimported modules are never scanned.

**The model says "I looked it up" but there's no tool.started in the event stream.** The model is fabricating the tool call (a hallucination variant). Common causes: the persona doesn't say when to use which tool, or the tool description is too vague. Write usage rules into the persona (as in step 3).

**"Tool signature drift" error.** You changed a mounted tool's function signature while the agent's version snapshot records the old one. Re-run `luban init` to produce a new version containing the new signature. That's protection, not failure.

**Online test-run returns 400/422.** Nine times out of ten it's the body format — arguments go directly in the body (`{"student_id": "..."}`), not wrapped in `{"args": {...}}`.


## Related docs

Next task: [Configure knowledge retrieval](./05-knowledge-rag.md). Full fields and interfaces are in [the manual](../manual/index.md).

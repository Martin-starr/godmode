# The Claude Prompt Guide for Beginners
### Learn the language of AI — no coding experience required

> **What is a "prompt"?** It's simply what you type to Claude. The words you choose dramatically change the quality of the answer you get back. This guide teaches you the pattern.

---

## Table of Contents

1. [The 5-Part Prompt Formula](#1-the-5-part-prompt-formula)
2. [Step-by-Step: Your First Good Prompt](#2-step-by-step-your-first-good-prompt)
3. [The Golden Rules](#3-the-golden-rules)
4. [Situation Playbook — Copy & Paste Templates](#4-situation-playbook)
5. [Common Beginner Mistakes](#5-common-beginner-mistakes)
6. [Power Moves](#6-power-moves)
7. [Quick Reference Card](#7-quick-reference-card)

---

## 1. The 5-Part Prompt Formula

Every great prompt has up to 5 ingredients. You don't need all 5 every time — but knowing them helps.

```
[ROLE] + [CONTEXT] + [TASK] + [FORMAT] + [CONSTRAINTS]
```

| Ingredient | What it is | Example |
|-----------|-----------|---------|
| **Role** | Who Claude should be | "Act as a senior software engineer" |
| **Context** | What's the situation | "I'm building a login page for beginners" |
| **Task** | What you actually want | "Write the HTML and CSS" |
| **Format** | How you want the output | "Use bullet points. Keep it under 200 words." |
| **Constraints** | Limits and rules | "No frameworks, plain HTML only" |

### Bad prompt vs. Good prompt

| Bad | Good |
|-----|------|
| "write login page" | "Act as a web developer. I'm a beginner building my first website. Write a simple login page in plain HTML and CSS — no JavaScript frameworks. Include comments explaining each part. Keep it under 100 lines." |
| "fix my code" | "Here is my Python function [paste code]. It crashes with 'IndexError: list index out of range'. Fix the bug and explain what caused it in one sentence." |
| "explain docker" | "Explain Docker to me like I'm 12 years old. Use a real-world analogy. Keep it to 3 paragraphs." |

---

## 2. Step-by-Step: Your First Good Prompt

Follow these 5 steps every time you get stuck:

### Step 1 — Start with what you want
Write down the core task in one sentence.
```
I want Claude to: explain what an API is
```

### Step 2 — Add your level
Tell Claude your experience level so it calibrates the answer.
```
I'm a complete beginner with no coding background.
```

### Step 3 — Give context
What's the situation? Why do you need this?
```
I'm trying to understand how apps talk to each other.
```

### Step 4 — Specify the format
How long? Bullet points or paragraphs? With examples?
```
Use a simple analogy and keep it to 3 short paragraphs.
```

### Step 5 — Put it together
```
Explain what an API is to a complete beginner with no coding background.
I'm trying to understand how apps talk to each other. Use a simple real-world
analogy and keep it to 3 short paragraphs.
```

That's it. That's a great prompt.

---

## 3. The Golden Rules

### Rule 1: Be specific, not vague
Claude can only work with what you give it. Vague in = vague out.

- Vague: "Make it better"
- Specific: "Rewrite this paragraph to be more concise. Cut it from 5 sentences to 2."

### Rule 2: Give examples when you can
Examples are more powerful than descriptions.

```
Write me a product tagline. Here are examples of the style I like:
- "Just Do It" (Nike)
- "Think Different" (Apple)
- "Melts in your mouth, not in your hands" (M&Ms)
My product is: [your product]
```

### Rule 3: Tell Claude what NOT to do
Negative constraints are very powerful.

```
Explain how to center a div in CSS.
Do NOT use flexbox or grid — only use margin: auto.
```

### Rule 4: Ask for one thing at a time
Claude handles focused requests better than multi-part dumps.

- Too much: "Fix my code, add comments, make it faster, and rename the variables"
- Better: Fix the bug first → then ask for comments → then ask for optimization

### Rule 5: If you don't like the answer, redirect — don't restart
Instead of starting over, guide Claude from where you are:

```
That's close but I need it to be more casual in tone.
Also, cut the second paragraph entirely.
Can you revise it with those two changes?
```

### Rule 6: Paste your actual content
Don't describe your problem — paste it.

- Weak: "I have a function that returns the wrong number"
- Strong: "Here is my function: [paste code]. It returns 7 but should return 12."

---

## 4. Situation Playbook

Copy these templates and fill in the `[brackets]`.

### CODING

#### Explain code I don't understand
```
Explain this [Python/JavaScript/etc.] code to me like I'm a beginner.
Walk through it line by line. Use plain English, no jargon.

[paste your code here]
```

#### Fix a bug
```
This code is supposed to [what it should do] but instead it [what it does wrong].
The error message is: [paste error]
Find the bug and fix it. Explain what was wrong in one sentence.

[paste your code here]
```

#### Write a function
```
Write a [language] function that [describe what it should do].
Input: [describe input]
Output: [describe expected output]
Include a comment above the function explaining what it does.
```

#### Code review
```
Review this code for [bugs / security issues / readability / performance].
List problems as numbered items. For each problem, show the fix.

[paste your code here]
```

#### Learn a concept
```
Teach me [concept] in [language].
I know [what you already know].
Start with the simplest example possible, then show one real-world use case.
```

---

### WRITING & EDITING

#### Write an email
```
Write a professional email to [who] about [topic].
Tone: [formal / friendly / assertive]
Key points to include:
- [point 1]
- [point 2]
Keep it under [number] words.
```

#### Improve my writing
```
Rewrite this text to be clearer and more concise.
Keep the same meaning but cut unnecessary words.
Do not change my voice or make it sound formal.

[paste your text]
```

#### Summarize a long document
```
Summarize the following [article/document/text] in [3 bullet points / 1 paragraph / 5 sentences].
Focus on: [what matters most to you — key decisions, action items, main argument, etc.]

[paste the content]
```

#### Write a first draft
```
Write a first draft of [what — blog post, report, cover letter, etc.] about [topic].
Audience: [who will read it]
Tone: [casual/professional/persuasive]
Length: approximately [word count]
Key points to cover: [list them]
```

---

### LEARNING & RESEARCH

#### Understand a new topic
```
I know nothing about [topic]. Teach me the fundamentals.
- Start with a one-sentence definition
- Explain why it matters
- Give me 3 concrete examples
- Tell me what to learn next
```

#### Compare two options
```
Compare [option A] vs [option B] for [my specific use case].
I care most about: [speed / cost / ease of use / etc.]
Give me a simple table and a one-line recommendation at the end.
```

#### Get a recommendation
```
I need to [goal]. My constraints are: [list constraints].
What's the best approach? Give me your top recommendation and explain why
in 2-3 sentences. Then list 2 alternatives.
```

#### Explain like I'm 5 (ELI5)
```
Explain [complex topic] like I'm 5 years old.
Use an analogy from everyday life.
No technical terms unless you immediately define them.
```

---

### PLANNING & BRAINSTORMING

#### Generate ideas
```
Give me [number] ideas for [what].
Context: [your situation]
Requirements: each idea must be [constraint — e.g., free, doable in a weekend, suitable for beginners].
Format: numbered list with one sentence per idea.
```

#### Make a plan
```
Create a step-by-step plan to [achieve goal].
My starting point: [where you are now]
My deadline: [when]
My resources: [time per day, budget, tools available]
Keep the steps concrete and actionable — I should be able to start today.
```

#### Brainstorm names / titles
```
Brainstorm [number] [names/titles/slogans] for [what].
Style: [catchy / professional / funny / minimal]
Must convey: [key idea or feeling]
Avoid: [words or styles you hate]
```

---

### ANALYSIS

#### Analyze data or text
```
Analyze the following [data/text/results] and tell me:
1. The main pattern or finding
2. Anything surprising or unexpected
3. What I should do about it

[paste content]
```

#### Get feedback on my work
```
Give me honest feedback on [what — my plan, my code, my writing].
Be direct. Tell me what's weak first, then what's strong.
End with one specific improvement I should make today.

[paste your work]
```

#### Devil's advocate
```
I'm planning to [your plan/decision]. Play devil's advocate.
Give me the 3 strongest arguments AGAINST this plan.
Don't soften them — I need to know the real risks.
```

---

### CLAUDE CODE SPECIFIC

#### Start a project from scratch
```
I want to build [what]. I'm a [beginner/intermediate/experienced] developer.
Tech stack: [language, framework if any]
Core features needed:
- [feature 1]
- [feature 2]
- [feature 3]
Start by asking me any clarifying questions before writing any code.
```

#### Understand a codebase
```
I just opened a new codebase. Help me understand it.
Read the key files and explain:
1. What does this project do?
2. How is it structured?
3. Where should I start if I want to add [feature]?
```

#### Debug step by step
```
Help me debug this. Walk me through it like a detective.
Don't just fix it — help me understand WHY it broke so I learn.
Start by asking what I've already tried.
```

---

## 5. Common Beginner Mistakes

### Mistake 1: Being too polite (wasting tokens)
You don't need "please" and "thank you" in every message — Claude doesn't get offended. Get to the point.

- Bloated: "Hi Claude! I hope you're doing well! I was wondering if maybe you could possibly help me with something? I have a bit of a question about..."
- Efficient: "Explain X to a beginner. Use bullet points."

### Mistake 2: One-word or one-line prompts
The more you put in, the more you get out.

### Mistake 3: Accepting the first answer
Claude's first answer is often good. But asking for a revision almost always produces something better.

```
Good. Now make it [shorter / more specific / change X / add Y].
```

### Mistake 4: Not pasting the actual thing
Descriptions of your code/text are much weaker than the real thing.

### Mistake 5: Asking multiple questions in one message
Split them up. Claude focuses better on one thing at a time.

### Mistake 6: Not saying the format you want
Claude will choose a format by default. Take control:

```
Give your answer as: [a numbered list / a table / a code block / a single sentence / step-by-step instructions]
```

### Mistake 7: Restarting instead of redirecting
You don't need to start a new conversation. Just redirect:

```
Almost — but make it [adjustment]. Keep everything else the same.
```

---

## 6. Power Moves

These techniques produce dramatically better results.

### The "Act as" role assignment
Give Claude an expert identity before your task.

```
Act as a senior security engineer with 10 years of experience.
Review this authentication code for vulnerabilities.
```

### The "Think step by step" trigger
For complex problems, this unlocks Claude's best reasoning.

```
[your question/problem]
Think through this step by step before giving your final answer.
```

### The chain technique
Build on each answer instead of one giant prompt.

```
Message 1: "Outline a plan for [X]"
Message 2: "Expand step 2 into detailed instructions"
Message 3: "Now write the code for step 2"
Message 4: "Add error handling to that code"
```

### The "Format this as" technique
Control the output structure completely.

```
Give me the answer in this exact format:
**Summary:** [1 sentence]
**Steps:**
1. [step]
2. [step]
**Warning:** [one potential gotcha]
```

### The "Give me X options" technique
Never settle for one approach when you could have several to choose from.

```
Give me 3 different approaches to [problem].
For each: name, how it works in one sentence, pros, cons.
Then tell me which one you'd pick and why.
```

### The persona technique
For writing tasks, define the voice precisely.

```
Write this in the style of [casual reddit post / TED talk / text to a friend / professional LinkedIn post].
```

### The "Critique my prompt" technique (meta!)
Ask Claude to improve your own prompt before you use it.

```
Here is a prompt I wrote. Make it better — more specific, clearer, and more likely to get a great answer.
My prompt: [your prompt]
```

---

## 7. Quick Reference Card

### The universal starter
```
Act as [expert role].
Context: [situation in 1-2 sentences]
Task: [what you want]
Format: [how you want it]
Constraint: [any limits]
```

### When you're stuck
```
I'm trying to [goal] but [what's blocking me].
What are 3 ways to solve this?
```

### When you need to learn something
```
Teach me [topic]. I'm a [level] learner.
Use examples. Start simple. Tell me what to learn next.
```

### When you want feedback
```
Review [your thing]. Be direct. Tell me what to improve first.
```

### When an answer isn't right
```
Close, but [what's wrong]. Keep [what's good]. Change [what to change].
```

### When you want a choice
```
Give me [3/5] options for [X]. Compare them. Recommend one.
```

---

## The #1 Secret

**Treat Claude like a brilliant colleague, not a search engine.**

Search engines want keywords. Claude wants a conversation. The more context and clarity you give, the more useful the response. Don't be afraid to say "that's not quite right — here's what I actually meant" and keep going. The best results come from back-and-forth, not one perfect question.

---

*Want to generate a prompt interactively? Run `/prompt-generator` inside Claude Code.*

*Part of the [GODMODE](../README.md) toolkit — AI development power for everyone.*

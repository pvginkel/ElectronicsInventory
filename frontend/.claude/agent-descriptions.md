**Instructions for the agent writer**: Do not replicate documentation in the agent description. The agent must read established documentation instead of being fed the content from the agent description. Do tell the agent to read some specific document, but do not give the content to the agent.

This agent is used only when the user explicitly requests to use this agent by name. The name of the agent is code-reviewer.

The purpose of this agent is to execute a code review for the user. The user will provide you with an exact location of where the code is (one or more commits, staged and/or unstaged changes), plus a description of what was done. This may take the form of a write up or of a full plan.

Follow the instructions in docs/commands/code_review.md to perform the code review.

The user will have provided you a place to store the code review. If a file already exists at that location, delete it and create a fresh code review.

---

**Instructions for the agent writer**: Do not replicate documentation in the agent description. The agent must read established documentation instead of being fed the content from the agent description. Do tell the agent to read some specific document, but do not give the content to the agent.

This agent is used only when the user explicitly requests to use this agent by name. The name of the agent is code-writer.

The purpose of this agent is to write code. The user will provide you with a write up or a full plan of the work that needs to be done. Ensure that you deliver the implementation of the plan, in full, fully tested using the established patterns.

Follow the instructions in docs/contribute/index.md to write the code conform the established requirements.

---

**Instructions for the agent writer**: Do not replicate documentation in the agent description. The agent must read established documentation instead of being fed the content from the agent description. Do tell the agent to read some specific document, but do not give the content to the agent.

This agent is used only when the user explicitly requests to use this agent by name. The name of the agent is plan-writer.

The purpose of this agent is to write a plan off of requirements provided by the user. These requirements may be a write up or a document provided to you. 

Follow the instructions in docs/commands/plan_feature.md when writing the plan.

Plans are placed in folders following the structure docs/features/<FEATURE NAME>.md. If a plan.md file already exists in that folder, disambiguate the folder name by appending a sequence number to it. E.g. if you'd initially pick a folder name docs/features/new_idea, and a plan.md file already exists at that location, store the new plan in docs/features/new_idea_2 or docs/features/new_idea_3, whichever is available. The user may also provide a location for the plan to you.

---

**Instructions for the agent writer**: Do not replicate documentation in the agent description. The agent must read established documentation instead of being fed the content from the agent description. Do tell the agent to read some specific document, but do not give the content to the agent.

This agent is used only when the user explicitly requests to use this agent by name. The name of the agent is plan-reviewer.

The purpose of this agent is to review a plan. The user will provide the location of a plan to you and your job is to review it.

Follow the instructions in docs/commands/review_plan.md to perform the review.

The review needs to be placed in the same folder as where the plan is located. If a plan_review.md file already exists at that location, delete it before performing the review. The user will want a fresh review of the plan.

---

**Instructions for the agent writer**: Do not replicate documentation in the agent description. The agent must read established documentation instead of being fed the content from the agent description. Do tell the agent to read some specific document, but do not give the content to the agent.

This agent is used only when the user explicitly requests to use this agent by name. The name of the agent is plan-executor.

The purpose of this agent is to execute a plan. The user will provide the location of a reviewed plan to you and your job is to execute it. This agent oversees execution of the plan and ensures complete execution of the plan and a quality end result.

To execute a plan you will iterate through the following steps:

- Use the code-writer agent to write the code. If the agent was not able to execute the plan in full, help it to complete its work. This may take the form of:
  - Encourage the agent to proceed to the next slice or otherwise complete the work at hand.
  - Performing a partial review yourself to gain confidence in the direction taken by the agent. You may do a spot check, run tests or otherwise gain confidence in the quality of the work delivered. Feed your conclusions back to the agent and request it to continue the work.
  - Request the agent to tests its own code before handing the results back to you.
- Use the code-reviewer agent to perform a full review of the code delivered as follows:
  - Ask the code-reviewer agent to review the code. Provide it with a full path to the plan and the location where to store the code review at. This will be a file name code_review.md in the same folder as where the plan is located. If such a file exists already, delete it first.
  - If you get a GO from the code reviewer, but the code review document still identifies minor issues to be resolved, do get these resolved! Don't defer this work to a later iteration.
  - Review the generated document and answer any questions that you can answer with reasonable confidence. If questions are related to UX or code patterns, review the code base for established patterns and base your answer on those. Only defer back to the user if you're not able to answer the question with reasonable confidence.
  - Ask the same code-reviewer agent to resolve the issues that were identified during the review.
  - If you lack confidence in the end result, request a new code review from a new code-reviewer agent and go through these steps again. Place the second code review at a new location, e.g. code_review_2.md or code_review_3.md.

Note that you will not be able to stage or commit any work. You are doing your work inside a container that has the .git folder mapped read-only for safety. Do not attempt to stage or commit files. You will always request the code reviewer agent to review the unstaged changes.

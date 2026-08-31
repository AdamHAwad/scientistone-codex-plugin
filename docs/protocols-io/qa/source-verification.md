# Source verification

Checked on August 27, 2026.

## OpenAI product facts

- The current ChatGPT desktop app includes Chat, Work, and Codex on macOS and Windows: https://help.openai.com/en/articles/20001276
- First-time users download the desktop app, open it, and sign in: https://help.openai.com/en/articles/20001276
- The official download page supplies separate macOS and Windows buttons: https://chatgpt.com/download/
- The macOS app requires macOS 14 or newer: https://help.openai.com/en/articles/9395554
- The Windows app requires Windows 10 version 17763 or newer: https://help.openai.com/en/articles/9982051
- The Linux desktop app is available in preview on listed Ubuntu, Debian, and Fedora versions. This protocol was tested only on Mac and Windows: https://learn.chatgpt.com/docs/linux/linux-app
- Codex is included with Plus, Pro, Business, Enterprise, and Edu. Free and Go access is limited at the time of this check: https://help.openai.com/en/articles/11369540
- Plan limits and prices can change, so the guide sends readers to the live Codex pricing page: https://chatgpt.com/codex/pricing/
- Workspace administrators may control Codex and plugin access: https://help.openai.com/en/articles/11369540
- Personal ChatGPT workspaces can turn off model training under Profile > Settings > Data Controls > Improve the model for everyone: https://help.openai.com/en/articles/7730893-how-chatgpt-uses-browser-history-and-data
- Business, Enterprise, and Edu inputs and outputs are not used for model training by default: https://help.openai.com/en/articles/8983130-how-does-chatgpt-use-my-data
- The current permission label is **Approve for me**. It routes eligible requests to a separate reviewer AI while the main Codex agent stays inside the same sandbox. Some requests can still require the person's decision: https://learn.chatgpt.com/docs/sandboxing and https://learn.chatgpt.com/docs/sandboxing/auto-review
- The desktop app normally handles its own updates. A full quit and reopen may be needed to apply them: https://learn.chatgpt.com/docs/enterprise/manage-app-updates
- Current Codex versions start a background check for configured Git marketplaces when the app server starts. OpenAI's user guidance still recommends **Refresh** when someone wants the latest version of an imported marketplace plugin: https://raw.githubusercontent.com/openai/codex/main/codex-rs/core-plugins/src/manager.rs and https://help.openai.com/en/articles/20001256-plugins-in-codex

## Protocols.io structure

- Protocols.io supports sections, steps, substeps, notes, warnings, expected results, and attachments: https://www.protocols.io/help/editor/steps-sections-substeps
- General Protocols.io help: https://www.protocols.io/help

## Local product evidence

- The seven Scientist1 setup titles and button names were checked against the bundled UI and a temporary local run.
- Screens 1 through 7, the waiting page, and the plan-review page were recaptured from one local run in a 1920 by 993 desktop browser viewport. Focus was moved away from headings before each capture. The review request shows the attached synthetic CSV.
- The installed Codex desktop app was checked for the current marketplace labels: Plugins, Add a marketplace, Source, Add marketplace, Search plugins, Install, and Try now.
- The installed Codex desktop build checked for those labels was 26.818.61809.
- The plugin source was checked against release commit `9c0a8779b842c1e3b0131e89f9214ea3cc6c60c9`. The guide edits in this package were not committed during this task.
- No real research data, credentials, or private project files were used.
- The practice results were recalculated from `example-data/bean-seedling-growth.csv` by `qa/content_check.py`.

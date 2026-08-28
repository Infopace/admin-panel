# Daily Updates

Short, crisp log of what got built each day. Newest entry on top.

---

## 2026-08-28

- Reviewed `DASHBOARD.docx` against the codebase, mapped every section to build status
- Ran a live schema audit across all 5 Supabase projects — confirmed which monitoring features are actually buildable vs. blocked by missing data (session-status, timestamps)
- Built usage trend chart, live activity feed, alerts panel, system health monitoring, report generation logging
- Fixed trend chart rendering bug (was showing as a solid block instead of bars)
- Built Organization Monitoring, User Monitoring, Tool Dimensions (Creative & Innovation), and AI profile insights on the candidate drawer
- Created the **Analytics** module: moved all monitoring out of Overview into its own page, with an All Tools view and a per-tool drill-down (status header, scoped trend/live activity, score distribution, dimensions, org/user monitoring)
- Added Payment Monitoring (revenue for Creative & Innovation, paid/unpaid conversion for Market Research and Market Potential); confirmed Market Research's real payment_status values and upgraded it from a raw breakdown to a proper conversion metric
- Added a low payment-conversion alert
- Closed remaining doc gaps: Tool Category label, per-tool Error Rate + Reports columns in the monitoring table, Most/Least Active Organization highlight, cross-tool Organizations/Users/Reports summary row
- Added Report Generation Time (avg) and Reports Regenerated count
- Full re-pass on every doc section: Active Users/Orgs/Reports Pending/Failed Requests on the master KPI row, Min/Max score, a "Today's Snapshot" strip on Live Activity, New/Returning/Active-30d/Avg Score on User Monitoring, active-org count, Last Successful Processing + Report Service status on System Health, a report-generation-delay alert, and a per-tool System Health panel — closing every parameter that was genuinely buildable, not just the easy ones
- Started `daily_updates.md`
- Fixed sidebar clipping the user profile/logout on shorter viewports (added scroll)
- Added real Tool Availability checks — pings each tool's actual public site (URLs provided by the user), separate from the existing DB-query health, after Market Potential's site showed suspended while its database kept responding fine. Needs verification on a machine with normal internet access — this sandbox can't reach external domains to confirm live results
- Added `npm run dev` (backend auto-restart on file change) so `git pull` + edits don't need a manual server restart
- Trend chart bars now show a per-tool breakdown on hover/click instead of just the combined daily total
- Fixed the breakdown being hidden on single-tool days (it only showed when 2+ tools contributed) — every bar now names its tool(s)

**Still open — genuinely blocked, not just unbuilt:** Completion Funnel and Time Monitoring (no session-status or start-timestamp column exists in any of the 5 databases — needs the source apps to add instrumentation); In Progress/Abandoned counts and true Completion Rate (same root cause — "completed" and "total attempts" are currently the same number); Active Sessions (no session-tracking data); the 4 additional psychometric tools (waiting on credentials). None of these can be built without new data or new access — they're not on the to-do list, they're on the blocked list.

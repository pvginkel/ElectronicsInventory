Can you do a code review on the implementation of @docs/features/prometheus_metrics/plan.md. I've already seen that a lot of imports were done under the TYPE_CHECKING flag. I'd like that removed. Please make a note of this and as part of fixing the issue, the TYPE_CHECKING flag throughout the codebase where it isn't necessary to prevent circular dependencies. If you do find one (I know of one at least), dcoument that the TYPE_CHECKING check is necessary for that reason. I also noticed that the metrics service is added a bunch of times as an optional dependency. I also don't like that. Make it mandatory and update the tests please.

Can you also sanity check for me whether the interval _background_update_loop really needs to be one second. One minute should be enough I think, but I'd accept 10 minutes also. Also, possibly the shutdown algorithm can be improved by using an event (synchronization primitive).

Don't use time.time() to measure relative time. Use time.perf_counter().

Really please don't use locals().

In AIAnalysis, metrics are tracked in run. It needs to be done at the level of _call_openai_api, per individual call into the API. Also, please remove measuring of function_calls and web_searches.
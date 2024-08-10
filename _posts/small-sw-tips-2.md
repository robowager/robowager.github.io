---
title: Small software tips, part 2
date: 2024-08-10
---

Some small software tips, with a bias towards python and robotics. They are
mostly style suggestions for maintainability of code, and not solutions to
problems. These are collected from personal experience, but I don't take credit
for them. I learned by working with engineers better than myself. When I need an
example application, I will consider software for an aerial drone that performs
deliveries.

# Contents
- [Exceptions](#exceptions)
  - [Adding exceptions](#adding-exceptions)
  - [Catching exceptions](#catching-exceptions)
  - [Exception trail](#exception-trail)
- [Levels of configuration](#levels-of-configuration)
- [Logging](#logging)
- [Documentation](#documentation)
- [Removing code](#removing-code)
- [Code review](#code-review)

# Exceptions

Handling non-happy paths can take a lot of effort. Exception handling can be
like the underworld of software: not immediately visible but pervasive (by
making the comparison, I don't mean that it should be messy). For software that
needs to be robust, every line might need to be scrutinized, and every feature
addition can raise new errors.

## Adding exceptions

When raising a new exception, spare a thought for calling code that might need
to handle it. Add code to catch the exception, or just bring it to the notice of
other engineers.

Raise a specific exception instead of generic ones that might have more than one
cause. For example, suppose our robot has multiple sensors, and the `Perception`
class stores a dictionary mapping sensor names to objects.
```
class Perception:
    def get_sensor_by_name(self, name):
        return self._sensors[name]
```

If called with a name that doesn't exist, we will likely get the built-in
`KeyError`. In a large codebase, where the `KeyError` could have more than one
source, it might be more informative to raise a custom exception.
```
class UnknownSensor(Exception):
    pass

class Perception:
    def get_sensor_by_name(self, name):
        if name not in self._sensors:
            raise UnknownSensor(f"No sensor named {name}")
```

The tip also applies to external modules. Suppose we are using a communication
library which defines a `ConnectionError`. Defining sensor-specific errors can
help calling code identify which sensor is misbehaving.

For code that is a component of larger software,
- start with a single exception,
- refine into variants as needed,
- define variants as children of a base exception.

For example
```
class SensorException(Exception):
    """ Base class for sensor exceptions. """

class InvalidSensorRequest(SensorException):
    """ Request for data was not well-formed. """

class SensorCrashed(SensorException):
    """ Could not return data because sensor died. """
```

Refine into variants when error handling is different.
```
def construct_map():
    try:
        get_sensor_data()
    except InvalidSensorRequest:
        # could fix request and retry
    except SensorCrashed:
        # could wait for sensor to restart
```

Catching the base exception is useful for calls that don't care about variants.
```
def execute_hairpin_turn():
    try:
        get_sensor_data()
    except SensorException:
        # abort motion and safely come to a stop
```

## Catching exceptions

The first tip is to keep code readable. It is sad to see a block of well-written
code summarily shoved inside a `try`. It is also hard to read nested
`try`-`except` blocks like below.
```
# try within a try
try:
    try:
         ...

# try within an except
try:
    ...
except:
    try:
        ...
```

Stack traces are very useful, but also tiring to wade through. Log a stack trace
from an exception only once to minimize noise.

Where should exceptions be caught? I will sketch out two patterns, but leave out
a discussion of how to choose one. The first option is to catch an exception
closest to a statement. This makes it clear to readers where the error can be
raised, and surrounding lines are saved an indent level. In the snippet below,
the `except SensorException` only wraps the call that can raise the exception.
```
def execute_docking():
    communicate_with_platform()
    fly_above_platform()
    try:
        detect_platform()
    except SensorException:
        ...
    descend_to_platform()
```

The second is higher up in the stack. This can save lines of code if multiple
sub-calls raise the same exception which would be handled the same way.
```
def finish_mission():
    try:
        execute_docking()
    except TrajectoryFailedToComplete:
        # One except instead of two identical try-except blocks around:
        # - fly_above_platform
        # - descend_to_platform
        ...
```

In the limit, a majority of exceptions are caught high up in the call stack.
```
def perform_mission():
    while continue_mission:
        try:
            attempt_mission()
        except SensorException:
            ...
        except TrajectoryFailedToComplete:
            ...

def attempt_mission():
    prepare_mission()
    perform_delivery()
    finish_mission()
```

The advantages are a separation of main logic from error handling, and a
convenient catalog of errors. Note the ladder of `except` blocks. A possible bug
is that an earlier `except` aliases a later one.
```
try:
    ...
except Exception:
    ...
except ValueError:
    # will never be reached
```

If recovery behavior for a particular exception is involved, it can be spun out
into its own function (which can be unit tested). This can help avoid `try`
statements nested inside `except` blocks, which can occur when exception
handling can itself encounter an exception.
```
def construct_map():
    try:
        get_sensor_data()
    except SensorCrash:
        sensor_crash_recovery()

def sensor_crash_recovery():
   # Check that this call is valid, by examining the error type:
   # - either pass in the error,
   # - or ensure an error stack is active.

    try:
        wait_for_sensor()
    except TimeoutError:
        # stop waiting and give up
```

## Exception trail

In software with many layers, the journey of an exception can be arduous,
traveling across processes and components. Suppose a user requests a drone
delivery, but the mission fails because of an unrecoverable sensor crash. The
path of the exception might be
- sensor driver,
- perception software,
- mission software,
- scheduling software,
- error message to user.

The exception might even change format along this trail, such as a conversion to
a string code. Avoid changing the name, e.g. `SensorCrash` to
`UNRECOVERABLE_SENSOR_FAILURE`.

Alongside a software trail, the exception might have an audience trail:
- perception engineers,
- other software engineers,
- live support engineers,
- the final user.

Error messages associated with an exception are important and depend on the
audience. A perception engineer might want gory details of the crash, a support
engineer would benefit from suggestions to resolve the issue, and the user only
needs a brief and clear message.

At earlier levels in software, we might like refined exceptions for fine-grained
handling. But further along the audience trail, we should seek to suppress or
consolidate exceptions, and simplify error messages.

# Levels of configuration

Software might need to support numerous levels of configuration. Consider a
parameter like `minimum_landing_area` used in `find_landing_zone`. To start
with, it might be a constant defined at the top of a file. This allows it to be
imported and used in other code (say in analysis).
```
# Prefer named constants to magic numbers, which are
# undocumented numbers floating around in code.
MINIMUM_LANDING_AREA = 1.5

def find_landing_zone():
    # make use of MINIMUM_LANDING_AREA
```

Class-level constants work too. The parameter can then be made an argument,
allowing callers to change the value.
```
MINIMUM_LANDING_AREA = 1.5

def find_landing_zone(minimum_landing_area=None):
    if minimum_landing_area is None:
        minimum_landing_area = MINIMUM_LANDING_AREA
    # make use of minimum_landing_area
```

Assume that a `Perception` object calls the
function, and stores the parameter value to use.
```
class Perception:
    def __init__(self, minimum_landing_area=None):
        self._minimum_landing_area = minimum_landing_area

    def landing():
        find_landing_zone(minimum_landing_area=self._minimum_landing_area)
```

A next level of configuration is to store values in a configuration file, to be
read during object creation. A use case is different hardware: we might have a
smaller drone, and the configuration file for it could specify a smaller landing
area.
```
def create_perception(config):
    """
    :param dict config: configuration read from a file
    """
    return Perception(
        minimum_landing_area=config.get("minimum_landing_area")
    )
```

Further, we can allow commandline args to override a configuration file. A use
case is for test engineers to temporarily modify a value.
```
def create_perception(cmdline_args, config):
    """
    :param dict cmdline_args: commandline args
    :param dict config: configuration read from a file
    """
    if "minimum_landing_area" in cmdline_args:
        minimum_landing_area = cmdline_args["minimum_landing_area"]
    elif "minimum_landing_area" in config:
        minimum_landing_area = config["minimum_landing_area"]
    else:
        minimum_landing_area = None
    return Perception(minimum_landing_area=minimum_landing_area)
```

Finally, the parameter may be modified online by higher-level software. Assume
that a scheduling software hands out missions to drones. The parameter value it
assigns can have highest priority.
```
@dataclass
class Mission:
    minimum_landing_area: Optional[float] = None

class Perception:
    def landing(self, mission):
        find_landing_zone(
            minimum_landing_area=(
                mission.minimum_landing_area or self._minimum_landing_area
            )
        )
```

The scheduler has a broader worldview. It might detect that weather conditions
are particularly windy in an area, and override the parameter to use a larger,
conservative value.

# Logging

Logging decisions made is crucial for debugging. As an example, consider the
following drone docking code, where we might want to log details of each step.
```
def execute_docking():
    communicate_with_platform()
    fly_above_platform()
    detect_platform()
    descend_to_platform()
```

The logging approach should be robust to errors that can be raised. For example,
if a `SensorException` occurs with `detect_platform`, we should still log
partial progress (the success of prior steps), and possibly the sensor exception.

The logging approach should maintain readability, e.g. avoid introducing
numerous `try` blocks just to aid logging.

Logging operations should not affect live software. They should be fast. What
about handling logging errors, such as database or connection issues? Consider
two options.
- We can interrupt or fail the mission, but preserve logs as far as possible,
  including issues with logging itself.
- We can complete the mission successfully, but lose logs.

The answer could depend on the stage of development (adding yet more
configuration complexity).
- We might choose option 1 early on, when we want to expose and fix all errors.
- We might choose option 2 after deployment, when completing missions is higher
  priority.

Prefer logging by addition-only, rather than modifying prior logs. For example,
- suppose there was an array of platforms,
- a drone docked to an invalid one,
- which it realized, and then re-docked to a valid platform.

Instead of maintaining a single log for the docking operation, which contains
the result of the final successful maneuver, prefer maintaining logs for each
docking attempt, including failed ones. Not only is this more informative, it is
simpler than looking up the single log and determining how to correctly update it.

Logging by publishing events to a stream can address these requirements, at the
cost of being potentially harder to implement, than say logging directly to a
database.

# Documentation

When adding code for a new algorithm, commit a small script showing how to run
it. This can be as effective documentation as a separate how-to wiki page.

Unit tests are a great kind of documentation and tutorial of features,
especially if they build up from simple to complex tests.

Source code documentation should be required for 'incantations', the kind of
magic that can show up when using libraries like `re` (regex) or `pandas`. It is
fine if someone wants to compress a lot of cleverness into a single line, but it
should at least be well-explained.

# Removing code

Dead code creeps in over time when multiple engineers contribute to a large
file. Small examples of such code that can be removed are:
- unused `import`s,
- unused variables, and arguments,
- `except` blocks for unused errors.

More insidious are lines that do not affect correctness, but make code
inefficient, e.g. unnecessary locks, database saves, or state
synchronization. It is easy for a developer to add the use of a lock with the
justification that it can't possibly hurt. But allow many of these to
accumulate, and it can become difficult to reason about which of them are
minimal for correct operation.

If we remove the use of a feature from an application, we can still keep around
the feature's source code for reference. As an example, suppose that an earlier
version of the drone used a bluetooth sensor to detect if the docking platform
was nearby. Suppose that the sensor was then removed because it was found to be
redundant. We could remove the `bluetooth_sensor` instance variable from our
`Perception` class, while keeping around the `perception/bluetooth.py` file.

There might be good reasons to remove the source code as well though. The unused
source code can be a distraction by showing up in code search tools. Deleting it
can free up valuable names/ namespaces, which can then be occupied by more
recent code. We can always add a tag to the repository for the option of
checking out old code.

# Code review

I loosely picture code that needs to be reviewed as a tree: something that
needs to be maintained, grown, and pruned.

![tree](/small-sw-tips-2/tree.png)

Engineers working on some software might not have the full picture. They might
zoom into their area of interest and make changes that get the job done, but
don't fit overall style. A task of code review is to make such changes
consistent with existing code.

![tree consistency](/small-sw-tips-2/tree_consistency.png)

Consistency can be a valuable property of code that many developers contribute
to. In our drone example, perception engineers might have figured out a good
data access pattern to avoid race conditions. This can be followed when writing
software for a new sensor, or more broadly in the codebase. Or we might note
that drone docking and take-off involve similar operations, and refactor code so
that they appear symmetric.

![tree symmetry](/small-sw-tips-2/tree_symmetry.png)

Software can accumulate numerous features over time. Having an overall picture
helps avoid clutter by adding features at an appropriate depth in code, hidden
from the main flow of logic. For example, we might add a machine learning
component to add semantic labels to a map. Instead of introducing a
`semantic_labeler` object everywhere in the mission code, we can choose to push
it down inside a `construct_map()` function call.

![tree feature](/small-sw-tips-2/tree_feature.png)

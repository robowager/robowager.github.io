---
title: Small robotics software tips
date: 2024-08-11
---

Some small tips for writing software for robotics. These are collected from
personal experience, but I don't take credit for them. I learned by working with
engineers better than myself. When I need an example application, I will
consider software for an aerial drone that performs deliveries.

# Contents
- [Simulation](#Simulation)
  - [Simulation levels](#simulation-levels)
  - [Against simulation](#against-simulation)
- [Sensors](#sensors)
  - [Sensor data](#sensor-data)
  - [Sensor software layers](#sensor-software-layers)
- [Comms](#comms)
- [Retry loop](#retry-loop)
- [Analysis](#analysis)

# Simulation

## Simulation levels

Simulation (sim) can be implemented at different levels in the software
stack. For example, the drone system might consist of a navigation process
```
# runs in one process
class Navigation:
    def __init__(self, server):
        """
        :param server: used to receive requests for navigation information
        """
```

and a separate mission execution process.
```
# runs in another process
class MissionExecutor:
    def __init__(self, navigation_client):
        """
        :param navigation_client: used to query the navigation server
        """
        self._navigation_client = navigation_client
```

When executing a trajectory, the mission executor might query navigation for the
next waypoint to go to.
```
class MissionExecutor:
    def execute_trajectory(self):
        while continue_execution:
            next_waypoint = self._navigation_client.get_next_waypoint()
```

We have two options for sim, depending on the motivation.
- We can run the `navigation_client` in a sim mode, in which it makes no server
   requests and directly returns a waypoint. The advantage is simpler setup, as
   no navigation process is needed. Being able to run software easily is a
   motivation of simulation.
- We can run the navigation process in a sim mode. The advantage is a more
  representative setup, as the mission executor uses the real
  `navigation_client`. Being able to run software realistically is another
  motivation.

It is worth keeping in mind is that simulation can be another interface that
needs to be maintained. When a refactor is made, e.g. a new argument added to
`get_next_waypoint()`, we shouldn't break sim.

Simulation can also be implemented for different components, allowing the system
to be run in a mixed mode, such as simulated perception with a real system. As a
use case, suppose we are evaluating new rotors by executing various trajectories
on a drone. We don't want to risk collisions, so we might run in a wide open
test field that is known to be free of obstacles. We don't care about perception
in this case, and can use simulated perception.

Supporting such mixed sim modes can add configuration complexity. For example,
we might have the following sequence of flags. Any earlier flag specified as
`True` in configuration should force subsequent ones to be `True`, regardless of
their specified values:
- `simulated`: the entire system is simulated,
- `simulated_perception`: all of perception is simulated,
- `simulated_point_cloud`: the point cloud sensor is simulated.

## Against simulation

Enough virtues of sim have been sung, from enabling development when hardware is
scarce, to generating synthetic data for machine learning. I will state some
vices.

Simulation can be a distraction. Engineers can spend many hours making
simulation itself more featureful, while doing little to improve the performance
of actual software. As an example, for robotics software that consists of many
components, ensuring that their simulated behavior is consistent is a
challenge. To be more concrete, suppose that a difficult operating condition for
the drone is a sandstorm: winds buffet the drone, showing up as disturbances in
inertial sensors, and dust obscures perception, showing up as noise in vision
sensors.

How would this be simulated? If our simulation approach is to immerse the entire
software in a simulated environment, then some engineer is going to work on
building a sandstorm sim. If instead our approach is to sim various components
independently, we need to somehow share sim state, such that the inertial and
vision sensors' output is correlated.

How about not simulating? A heuristic is: if hardware is idle, an engineer
should not be working on sim. I concede that various issues crop up as soon as
one starts working with hardware. You might end up debugging device issues
rather than working on a fancy algorithm. But you might also come up with a
script to check that all devices are up and running. It could become a utility
that helps everyone run a real system, which is part of what robotics is about.

Robotics software builds a model of the world (whether implicit or
explicit). This model should be tested against reality, not simulation. I have
found unit tests with real data a useful alternative to simulation. Where I have
simulated a component, it could have equivalently been called a mock or no-op
component, as in the example above of testing trajectories on a real system
without perception. Mock components are also useful for integration tests, where
often deterministic behavior is needed, not simulated noise.

# Sensors

## Sensor data

As an example for this section, assume that our drone carries a payload in a
compartment. The payload is delivered at the destination by opening a hatch. A
displacement sensor in the compartment provides a binary signal of 0 when the
compartment is empty, and 1 otherwise. Nominal use of the sensor is that it
should read
- 1 before delivery, as a check that the payload has not been unintentionally
  dropped,
- 0 after delivery, as a check that the payload is not stuck after commanding
  the hatch to open.

![displacement sensor](/small-robotics-sw-tips/displacement_sensor.png)

Using sensors starts with calibration, which can take significant work for
complex sensors. Even the simple displacement sensor likely needs calibration
for how much displacement changes its value go from 0 to 1.

Working with time-varying data can be tricky. A direct implementation of the
nominal use of the displacement sensor will likely be insufficient. As the drone
moves about, the payload might jitter in the compartment, causing blips in the
sensor reading. The data might need to be smoothed before use.

The environment can be a factor. Consider a drone following a straight line in a
calm vs windy sky. With wind, the drone has to constantly correct for
disturbances, and the executed path might look like it oscillates around the
straight line. The displacement sensor will have more blips in this situation.

Making decisions for a robotics task can involve understanding the interaction
of sensing and actuation (or perception and planning). One way to deliver the
payload is for the drone to gently hover over the destination and open the
hatch. The displacement sensor reading might go from 1 to 0 as expected. But
suppose we implement a more aggressive delivery maneuver in order to speed up
missions.
```
def aggressive_delivery():
    dip_towards_destination()
    open_hatch_mid_flight()
    sharply_ascend()
```

The trajectory and sensor readings are depicted in the image below. Before
delivery, at time `t0`, the sensor reads 1. After delivery, at time `t1`, we
might expect the sensor to read 0. But a large vertical acceleration during the
ascent, ongoing at time `t2`, can compress the sensor, causing a steady reading
of 1 for a while. This is independent of whether the compartment is empty, and
might cause us to falsely conclude that the payload drop failed.

![aggressive delivery](/small-robotics-sw-tips/aggressive_delivery.png)

An option is to read the displacement sensor a fixed delay after calling
`open_hatch_mid_flight`. But a tip is that such delays can be unreliable when
working with sensor data. Instead, prefer using actuation information (or more
broadly, knowledge of the robot's actions). From the planned ascent trajectory,
we should be able to figure out a waypoint at which the vertical acceleration
reduces, time `t3` in the image. This gives us a better starting point of when
to read the sensor. Logging raw sensor data, along with when the sensor is read,
can be very helpful in tuning such logic.

## Sensor software layers

A way to structure software around a sensor is by
- driver,
- comms,
- application.

For the binary displacement sensor example, the driver can implement the feature
of smoothing data.
```
class DisplacementSensor:
    def get_raw_data(self):
        ...

    def get_smoothed_data(self):
        ...
```

Python's context managers can be put to good use when working with sensors, for
similar reasons as resources like file handles. The context manager can check
that the sensor is in a good state on entry, and perform cleanup and error
handling on exit.

A more complex sensor like a camera might have a comms layer to serve data
requests. The separation of driver and comms software is useful to allow
multiple comms implementations, such as using ROS or protocol buffers. The
separation also makes it easier to test the driver layer, by not having to setup
comms in a unit test.

The application layer can contain task-specific functionality. For the drone
software this could be
```
class PayloadSensor:
    def __init__(self, sensor):
        """
        :param sensor: the underlying sensor, could
            be the driver or a comms client
        """

    def check_delivery(self, trajectory, execution_progress):
        """
        :param trajectory: the planned aggressive delivery trajectory, used
            to determine when to read the sensor
        :param execution_progress: some sort of feedback that tells us
            when the hatch was opened, the current waypoint in the delivery
            trajectory, etc
        """
```

The application layer makes the task requirements clear. Suppose we wanted to
upgrade from a binary to continuous displacement sensor, a good goal is to try
using the same `PayloadSensor`.

Conversely, we might find a separate use for the binary displacement
sensor. Suppose the docking platform runs its own software. We can add a
displacement sensor to the platform to confirm that a drone successfully lands
on it. The sensor readings might be more well-behaved here. We can use the same
driver and comms layer, but skip the more complicated `PayloadSensor`.

For a robot system, there might be many modes of running the same sensor, which
have to be supported via configuration.
- Not using the sensor, when no configuration is specified. This might be the
  choice if the hardware was initially designed without the sensor.
- Creating a sensor interface, if specified in configuration.
- Disabling the sensor, if explicitly configured. This is useful if the sensor
  breaks during operation.
- Running the sensor in shadow mode, where we collect data in the background,
  but don't make decisions on it.

# Comms

Dealing with comms is essential in robotics software, where there are many
processes and devices. Here are some tips for dealing with comms-related issues,
referring to the earlier example of the drone having a separate navigation and
mission executor process.

A client needs to check that a network connection to the server exists. Instead
of performing such a check on startup, prefer delaying it to when the client
makes a request. This removes assumptions on process ordering during startup.

Build in robustness due to network lags. Suppose the mission executor expects
waypoints at a certain rate. What if the next waypoint is delayed? It might be
alright to stall for as long as possible, so as not to abort the trajectory.

Build in robustness to processes dying and restarting, which is more drastic
than delays. For example, instead of making a separate call to navigation for
each waypoint, the mission executor might receive waypoints as part of one
long-lived network call (such as a ROS action or streaming RPC).
- What if the navigation process dies in the middle of this call? Can the
  mission executor detect and recover from it?
- What if the navigation process restarts? Will it pick up state from the
  previous call, or should the mission executor start a new one?

Another heuristic: for every server introduced, there should be a corresponding
console. Here's what I mean. Suppose the drone delivery system has the following
processes:
- scheduler,
- mission executor,
- navigation,
- sensor.

Every process exposes a server, and has a client to the process below. Every
process receives requests from the process above, and makes requests of the
process below. Then for each server, there should exist a console, which is
simply a lightweight client that can be run manually in a terminal.

The main purpose of a console is manual debugging. Suppose we notice a sensor
issue occur during a rare mission. Instead of waiting for the scheduler to
assign such a mission again, we could fire up a mission console, and submit it
to the mission executor. Or a perception engineer might open up a sensor console
to directly request data from the sensor.

Ideally, a console needs little new code. It should be designed to be
user-friendly, e.g. if a request message has a large number of fields, defaults
can be supplied.

# Retry loop

The retry loop is a pattern to make software robust.
```
def retry_loop():
    while continue_attempts:
        try:
            task()
        except Exception as error:
            handle_exception(error)

    if task_failed():
        fallback()
```

Exceptions encountered while trying to run a task are fed to a handler, an
example of catching exceptions high up in the call stack. We continue trying
till the task succeeds, or too many exceptions occur. If the task failed, we
might execute a fallback. A classic example of a fallback with mobile robots is
coming to a safe stop.

Retry behavior can be configurable. For example, we might have retry limits for
different exceptions. These might be adjusted in both directions.
- If a network is known to be flaky, we can increase the limit for connection
  errors.
- If we determine that a sensor never recovers from a kind of malfunction, we
  can decrease the number of retries on that error to 0.

A fine point is that the retry loop assumes that a single exception occurs
during an attempt, but this may be false. Suppose our drone has multiple rotors,
and one of them faults while executing a trajectory. It could raise two errors:
a hardware error from the rotor driver, and a trajectory error that we failed to
reach a waypoint. The root cause for the errors are the same, but their handling
will be different (e.g. restarting the rotor, and re-executing a trajectory with
the remaining rotors).

The retry loop can be applied to different levels in the software stack. For
example
- a driver could retry querying a sensor,
- a comms layer could retry on connection errors,
- mission execution can retry high-level actions.

Advantages of multiple retry loops are that
- exceptions are retried on by components that can handle them best,
- only sufficiently severe exceptions are passed on to higher levels.

Watch out for these bad uses of retry loops which introduce inefficiencies.
- The retry loop can hide errors that are fixable. An example is that first-time
  query of a sensor might always fail due to a bug with its initialization. We
  might miss the bug if we are monitoring only task success, and not the number
  of retries it takes to succeed.
- Multiple levels of retry loops might retry on the same exception, effectively
  increasing the retry limit. This is confusing code and it is best to limit
  handling a particular exception to a single loop.

# Analysis

Adding features is only one part of robotics software. As important is analysis
of performance once software is deployed. Robots generate a lot of data related
to sensors, actuators, and decision-making. A tip is to invest effort in making
both data and analysis widely accessible.

Making data accessible can look like uploading data to a shared location, rather
than locked up on a robot computer. Making analysis accessible might look like
committing jupyter notebooks to a repository. Analysis scripts don't have to be
as clean and general as production code. They only need to be clear enough for
others to use as a starting point.

An analysis exercise I have often gone through is imposing of order on a mass of
anomalous events, like so.
- Collect all cases of failure to complete a mission.
- Start manual investigation, annotating with human-readable reasons.
- As categories start to emerge, name them with fixed labels,
  e.g. `NO_WAYPOINTS_FOUND`, `PAYLOAD_DROP_FAILED`.
- Enter the labels in code, say as an enum. This is the point of crossing over
  from informal analysis of reasons to formal labels in software.
- Start logging the labels along with live missions. This creates a partially
  annotated dataset that can further be used, e.g. to tune retry limits, or
  train a new machine learning model for navigation.
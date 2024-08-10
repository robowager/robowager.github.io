---
title: Small software tips, part 1
date: 2024-08-09
---

Some small software tips, with a bias towards python and robotics. They are
mostly style suggestions for maintainability of code, and not solutions to
problems. These are collected from personal experience, but I don't take credit
for them. I learned by working with engineers better than myself. When I need an
example application, I will consider software for an aerial drone that performs
deliveries.

# Contents
- [Saving indents](#saving-indents)
- [`import` statements](#import-statements)
- [`if` blocks](#if-blocks)
- [`return` statements](#return-statements)
- [Using `None`](#using-none)
- [Avoid unnecessary variables](#avoid-unnecessary-variables)
- [Naming](#naming)
- [Standalone functions](#standalone-functions)

# Saving indents

I like to reduce indent levels where possible. Code that is deeply indented
might be an opportunity to refactor and simplify. It is hard to read and keep
track of scope in such code, and I have found editing such code to be more
error-prone.
```
def function():
    while condition:
        with resource:
            if predicate:
                # already at 4 levels of indent
```

Many other tips involve saving indents in some way.

# `import` statements

Ideally all `import`s appear at the top of a file. A way to group modules is:
standard library, external, internal.
```
import datetime
import itertools

import numpy

import data_types
import perception
import analysis
```

The `import`s can be further ordered, say alphabetically, or based on
dependency. The last three `import`s above are from our hypothetical robotics
project, and presumably the `data_types` module is used by `perception`,
whose output is used in `analysis`.

All imports from a module should appear in a single line. So instead of
```
from perception.detectors import ObjectDetector
...
from perception.detectors import detect_edges
```

prefer
```
from perception.detectors import ObjectDetector, detect_edges
```

It's good to preserve logical dependency across project modules. For example, we
might add a function `calculate_area` to our `analysis` module, which another
engineer might then want to use in `perception`. Importing `analysis` code into
`perception` might work, but it would go against the dependency order stated
earlier, and possibly introduce a circular `import` situation. Instead, we can
move `calculate_area` to `perception`, or to another module that both depend on,
like `perception_helpers` (sounds silly here but might not in a large
codebase). A fallback is to `import analysis` in `perception`, but in local
scope, which can get around a circular dependency.
```
# in a file in perception/

def find_landing_zone():
    from analysis import calculate_area
```

# `if` blocks

In a function, an `if` block that returns (or otherwise exits by raising an
error) doesn't need to be followed by an `else` block. So instead of
```
def function():
    if condition:
        # do work
        return
    else:
        # do other work
```

prefer
```
def function():
    if condition:
        # do work
        return

    # do other work
```

Rather than a bunch of nested `if` statements, I prefer an `if`-ladder, which is
closer to a `switch`, such as
```
if condn1:
    return value1
if condn2:
    return value2
...

return fallback_value
```

which is easier to debug and test. Due to the structure, only one block (the
first matching condition) can be hit, and we know that all previous conditions
evaluated to `False`. As an example, suppose our drone has two vision sensors, a
lidar generating point clouds, and a stereo camera. When finding a landing zone,
we need to check if the data is recent, and prefer using the point cloud if it
is of good quality. A hard to read version is
```
def find_landing_zone():
    """ 
    :return: True if landing zone detected
    """
    if not data_stale():
        if point_cloud_good():
            if find_landing_zone_in_point_cloud():
                return True
            else:
                if find_landing_zone_in_stereo():
                    return True
                else:
                    return False
        else:
            if find_landing_zone_in_stereo():
                return True
            else:
                return False
    else:
        return False
```

which is the same as a flatter version.
```
def find_landing_zone():
    """ 
    :return: True if landing zone detected
    """
    if data_stale():
        return False
    if point_cloud_good() and find_landing_zone_in_point_cloud():
        return True
    if find_landing_zone_in_stereo():
        return True
    return False
```

# `return` statements

Returning early from a function is a simple way to save indents and improve
readability. So instead of
```
def function():
    if condition:
        # lots of work
```

prefer
```
def function():
    if not condition:
       return

    # reduced indent level for lots of work
```

Avoid using tuples to return multiple values. It is a pattern that is hard to
extend. As an example, suppose `find_landing_zone` currently returns a tuple,
```
def find_landing_zone():
    """
    :return: whether landing zone found, area
    :rtype: (bool, float)
    """
```

and we want to add a measure of planarity.
```
def find_landing_zone():
    """
    :return: whether landing zone found, area, planarity
    :rtype: (bool, float, float)
    """
```

Then every `return` in the function has to be updated. This includes knowing
what to use as a null/ undefined value, say `(False, 0, None)`. If any calling
code unpacks the return,
```
landing_zone_found, area = find_landing_zone()
```

it needs to be updated as well, otherwise it may lead to an error like
`ValueError: too many values to unpack ...`. An alternative is to return a
`dataclass`.
```
from dataclasses import dataclass
from typing import Optional

@dataclass
class LandingZone:
      area: float = 0
      planarity: Optional[float] = None

def find_landing_zone():
    """
    :return: landing zone, if found
    :rtype: Optional[LandingZone]
    """
```

New fields can be added to `LandingZone` along with a default value, and
`return` statements that don't have a planarity will not need an update. A nit
is that I changed the convention of indicating that no landing zone was
found. Earlier, it was by returning `False` as the first tuple element, now it
is by returning `None`.

# Using `None`

It is nice to use a clear default value for an argument, like
```
def algorithm(threshold=0.5):
    pass
```

but there are situations where using `None` as the default value of an argument
helps. Suppose the drone executes a `Trajectory`
```
class Trajectory:
    def __init__(self, waypoints=[]):
        self.waypoints = waypoints
```

and that `waypoints` can be appended to as the drone is moving along the
trajectory. The empty-list default value is mutable, and can lead to bugs.
```
>>> traj1 = Trajectory()
>>> traj1.waypoints.append(0.1)
>>> traj1.waypoints.append(0.2)
>>> traj2 = Trajectory()
>>> traj2.waypoints
[0.1, 0.2]
```

An fix is to use a default value of `None`.
```
class Trajectory:
    def __init__(self, waypoints=None):
        self.waypoints = waypoints or []
```

Another use is if an argument has to be passed down through many function
calls. Suppose we add an optional threshold called `minimum_landing_area` with
a default value of `1.5`. This requires making sure the default value is the
same everywhere, which is hard to maintain.
```
perform_mission(*args, minimum_landing_area=1.5, **kwargs)
reach_address(*args, minimum_landing_area=1.5, **kwargs)
find_landing_zone(minimum_landing_area=1.5)
```

An alternative is to use a default value of `None`
```
perform_mission(*args, minimum_landing_area=None, **kwargs)
reach_address(*args, minimum_landing_area=None, **kwargs)
find_landing_zone(minimum_landing_area=None)
```

and then apply the default threshold in `find_landing_zone`.
```
def find_landing_zone(minimum_landing_area=None):
    if minimum_landing_area is None:
        minimum_landing_area = 1.5
```

Avoid overloading the use of `None` as a return value. For example, the function
`find_landing_zone` may return `None` on failure to find a suitable
location. There may be many reasons: perception data is stale, corrupt, or there
is genuinely no location. If the calling code needs to know which of these
situations occurred, instead of returning `None`, we are better off explicitly
communicating this information (as a return code or exception).

In customizable software, many components are optional, and their absence is
often indicated by `None`. The price paid is that we have to check for
`None`-ness, a sort of disciplined flexibility. For example, the same drone
software might have to run on multiple generations of hardware:
- prototype robots with no perception,
- robots with perception but no stereo camera,
- robots with newer stereo cameras that calculate surface normals natively.

If we want to make use of `perception.stereo_camera.surface_normals`, we have to
account for every field being `None`. Such `None` checks are best handled by a
few well-tested helper functions.

Another situation in which to check for `None` is state variables that may be
set only after instantiation. For example, perception might passively subscribe
to some `sensor_data`
```
class Perception:
    def __init__(self):
        self.sensor_data = None

    def receive_sensor_data(self, sensor_data):
        self.sensor_data = sensor_data
```

and `None` indicates that no data has been received yet. When there are multiple
such state variables, a better approach is to use an explicit flag indicating
that state has been initialized.

# Avoid unnecessary variables

If a variable is created only to be passed as an argument (to a function or
constructor)
```
def find_landing_zone():
    polygon = create_polygon(edges)
    area = calculate_area(polygon)
```

prefer
```
def find_landing_zone():
    area = calculate_area(polygon=create_polygon(edges))
```

For readability, use keyword arguments and proper formatting (a linter helps).

When calling a function that returns a tuple, avoid naming unused return
variables. For readability, a comment can be added explaining why they are
unused.
```
def execute_docking():
    # At this point in the function, we know the drone is
    # above a platform, so finding a landing zone is just a sanity check,
    # and we ignore the area detected.
    landing_zone_found, _ = find_landing_zone()
```

Avoid duplicate variables that store the same value. Suppose the system works by
receiving an order with the address for the drone to go to.
```
@dataclass
class Order:
    address: str
```

A `Mission` object is created for each order. The mission needs the address, but
instead of copying it into an instance variable
```
class Mission:
    def __init__(self, order):
        self.address = order.address
```

prefer storing the order itself. For convenient access, a `property` can be added to `Mission`.
```
class Mission:
    def __init__(self, order):
        self.order = order

    @property
    def address(self):
        return self.order.address
```

A duplicate variable is an opportunity for introducing error. There might be
code that has access to both the `order` and `mission` objects, and now there is
no chance of a discrepancy between `order.address` and `mission.address`. When
storing references, however, something to watch for is memory leaks.

# Naming

Choosing good names is important because renaming is hard. Names find a place
not only in code but also in people's heads. I once erred on the side of being
too descriptive with a name,
e.g. `landing_zone_minimum_area_perimeter_ratio_threshold`. When it became clear
that it was cumbersome and needed a refactor, edits were required in multiple
locations:
- the algorithm that made use of the threshold,
- calling code such as mission software,
- a message definition,
- a database field.

Avoid including implementation details in variable names, such as
`landing_zones_list`, instead preferring `landing_zones`. An implementation may
change.

Remove redundant tokens from names. If each robot has a unique identifier, it
can be stored as `robot.uid`, instead of `robot.robot_uid`.

When adding a new feature, resist the temptation to choose generic
names. If an engineer writes software to detect potential collisions to
stay away from, prefer `CollisionRegionDetection` to `SceneUnderstanding`. The
latter makes it sound like the feature solves all problems. I've seen classes
that do something very specific named a generic `Action` or `State`. Namespaces
help in this regard to contain names.

Avoid playing telephone with the name of a field that travels across
software. Consider a field like the `address` that a drone must travel to to. It could
have a path like:
- input by a user,
- serialized to a message, which is received by drone mission software,
- converted from the message to an internal data type,
- recorded to a database.

It seems harmless to substitute `address` with a synonym like `destination` at
some stage, or abbreviate to `addr`, but it is best to keep using `address`. If
the name has to be changed (because it is already in use), it can be done by a
helper function, and unit tested.

Unrelated to naming, but a similar tip is to avoid mangling the order of
arguments when calling a constructor or function, and use the order in the
definition.

# Standalone functions

I like to keep in mind three scenarios of calling a function.
- In live software. This is the most important use case. The function has to be
  correct and fast. It should log enough data to allow debugging.
- In unit tests. It should be possible to mock inputs without too much effort.
- On recorded data. Being able to replay the function is great for
  debugging. Extra logs in the function can be enabled at this stage for insight
  into what went on. If the function is fast enough to run on a dataset,
  parameters can be tuned for better performance.

I prefer standalone functions over instance methods for satisfying these
scenarios. Instance methods have easy access to object state, but for this same
reason, they can be harder to stand up in unit tests. This is especially true
for objects with heavy state, like a high-level mission class.

Python's first-class support for functions means that we can write flexible
software with standalone functions. A tip therefore is to pull out instance
methods and convert them to standalone functions if possible.

Similarly, avoid defining large functions inside another function. I have found
that these can be sloppily implemented. Moving the nested function out to where
it is clearly visible forces a cleaner implementation and better documentation.

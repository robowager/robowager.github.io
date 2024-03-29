---
title: Footwist, a tool to visualize 3D twists
date: 2022-12-01
---

I mostly think of rigid body poses in terms of 4x4 transformation matrices. For
orientation, there are tools for visualization
([example](https://quaternions.online/)) and conversion between representations
([3D Rotation Converter](https://www.andre-gaschler.com/rotationconverter/)).

I was reading the robotics textbook by
[MLS](https://www.cds.caltech.edu/~murray/books/MLS/) to learn more about
twists and screws. I made [footwist](https://robowager.github.io/footwist/)
([repo](https://github.com/robowager/footwist)), a tool for visualization of
twists and screws. You can specify a pose in the form of translation and
orientation (as quaternion), and the tool calculates the equivalent twist and
screw. It ends up demonstrating [Chasles'
theorem](https://en.wikipedia.org/wiki/Chasles%27_theorem_(kinematics)), which
states that any rigid body transform can be realized by a screw. You could also
use the GUI to update the twist or screw, and the other representations will be
calculated.

The project was a good opportunity to learn some JavaScript. The linter I used
(eslint with [airbnb](https://github.com/airbnb/javascript) style) was a great
teacher.  The libraries I used were:
- [mathjs](https://mathjs.org/) for all mapping and conversions, basically
  implementing the math in the MLS book.
- [three](https://threejs.org/) for very simple visualization. I could have
  also used three for a lot of the matrix math.
- [lil-gui](https://lil-gui.georgealways.com/) for the GUI, because that's what
  a number of three examples used.

Visualizing the screw that achieves a transform helps with intuition, but it's
also fun to just play around with values.

![move axes](/footwist/move_axes.gif)

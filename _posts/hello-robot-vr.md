---
title: Hello Robot in VR
date: 2021-12-19
---

## Introduction
Here's a robotics version of 'hello world' in a VR environment. 

![recording](/hello-robot-vr/recording.gif)

I'll describe how I set it up, but won't share any code. The approach was
brittle and the tools are outdated. If I had to start afresh, the high-level
approach would be to
- run the robotics application in ROS,
- run the VR environment as a Unity game, with which ROS would communicate, and
- let Unity handle the details of displaying to a headset. 

![high-level approach](/hello-robot-vr/1_high_level.png)

I only had a [Google Cardboard](https://arvr.google.com/cardboard/) and a wired
Xbox 360 controller. Getting a demo to work with them required a complicated
setup, shown below. I think things would be simpler with better hardware. It
was still a good learning experience, and I'll describe the role each component
played.

![overall system](/hello-robot-vr/5_overall.png)

I should clarify that I was only viewing and not controlling the robot via VR.

## Components

### ROS

I assume some robot application of interest that exists in ROS. I used ROS1,
but ROS2 is the way to go moving forward. It is common to run ROS in a
container, and I used the `ros:melodic` base. I used the
[AIKIDO](https://github.com/personalrobotics/aikido) library as the robot
environment, i.e. for creating a robot model from URDFs, computing forward
kinematics, and so on. The robot was a UR10 with the
[description](https://github.com/ros-industrial/robot_movement_interface/tree/master/dependencies/ur_description)
obtained from ros-industrial. I used the classic
[joy](https://wiki.ros.org/joy) ROS package to make use of my wired Xbox 360
controller. To summarize, I had a ROS node that
- created a UR10 using robot assets and AIKIDO,
- listened to joystick commands by subscribing to a joy node,
- updated robot joint states based on joystick commands, and
- published robot joint states on a topic.

The last step was important for the connection between ROS and Unity,
described below. ROS already has a great viewer, RViz, and AIKIDO allows easy
visualization of the robot in RViz. Some official ROS2 support for viewing RViz
in a headset (like the archived
[oculus_rviz_plugins](https://github.com/ros-visualization/oculus_rviz_plugins)
and [rviz_vive](https://github.com/AndreGilerson/rviz_vive) projects) would
make a project like mine unnecessary :)

### Unity

I used Unity to build a simple game that could be viewed in VR. It had a model
of the UR10 robot that was updated by joint states published by the ROS node.
The endpoint of such an approach is to build a full robotics visualizer in
Unity, which was attempted by the
[iviz](https://github.com/KIT-ISAS/iviz/tree/master/iviz) project.

I found [Unity Robotics
Hub](https://github.com/Unity-Technologies/Unity-Robotics-Hub) very helpful for
my tasks.
- I used [part
  1](https://github.com/Unity-Technologies/Unity-Robotics-Hub/blob/main/tutorials/pick_and_place/1_urdf.md)
  of the pick-and-place tutorial to setup the robot in Unity.  The same URDFs and
  meshes used in the ROS node worked here.
- I followed
  [ros_unity_integration](https://github.com/Unity-Technologies/Unity-Robotics-Hub/tree/main/tutorials/ros_unity_integration)
  to setup comms between ROS and Unity. The ROS side config was to clone the
  [ROS-TCP-Endpoint](https://github.com/Unity-Technologies/ROS-TCP-Endpoint)
  package into the workspace, build it, and run the endpoint node. On the Unity side, the
  [ROS-TCP-Connector](https://github.com/Unity-Technologies/ROS-TCP-Connector)
  had to be added to the game.
- I also had to generate the joint states message in Unity.

The ROS-TCP plugin allows information to flow both ways, although I was only
subscribing to messages from ROS in Unity. It could also be argued that for
this simple demo, ROS could be eliminated by reading the wired controller
inputs directly in Unity.

![ROS-Unity communication](/hello-robot-vr/2_ros_tcp.png)

For VR support, I used the [SteamVR Unity
Plugin](https://github.com/ValveSoftware/steamvr_unity_plugin).  It was easy to
use, I just had to drop the `CameraRig` prefab into the scene.  I also liked
that with Steam VR the same game could, in principle, work with different
headsets.

![Unity-cardboard communication](/hello-robot-vr/3_unity_cardboard.png)

### Cardboard viewer

I was using a Google Cardboard viewer with a Moto X4 Android phone. Connecting
the Unity game to the smartphone was cumbersome and the least disciplined
component in my system.

I used [Trinus Cardboard
VR](https://www.trinusvirtualreality.com/trinus-cardboard/) to display the
Unity game on the smartphone. On the Android end, I downloaded the Trinus CBVR
Lite app.  On the PC end, I had so far been working on an Ubuntu 20.04 host.
The Unity Hub and Editor worked well for me on Ubuntu. But the provided Trinus
Cardboard VR PC server was for Windows. I did try the open source
[LinusTrinus](https://github.com/MyrikLD/LinusTrinus) for running a Trinus
server in Linux, but it didn't work for me. I was forced to move to a Windows
host.

![Unity-cardboard communication using Trinus](/hello-robot-vr/4_unity_trinus_cardboard.png)

Using the Unity Editor on Ubuntu, I built the Unity game to run on Windows. I
installed Docker on Windows and re-created the ROS image there. But I hit
another roadblock when trying to access the wired controller in the ROS
container. This was a [known
issue](https://github.com/microsoft/WSL/issues/2195) on Windows. Instead of
investigating workarounds, I switched to running the ROS nodes in an Ubuntu VM
using [VirtualBox](https://www.virtualbox.org/). This was an unsatisfying
change, but I was close to the end. The VM ran reliably after a small amount of
configuration to pass-through the Xbox controller, and setup network so that
the ROS TCP node could communicate with the Unity game.

![overall system](/hello-robot-vr/5_overall.png)

## Result

Once all components were setup and running, I could move the robot with the
controller, and view the results on my smartphone and the Cardboard.

![recording](/hello-robot-vr/recording.gif)

An aspect that could have used more cleanup was the launch of components. I
ended up with a fairly long list of steps to follow to run the demo, starting
with having the controlled plugged in, running processes in a specific order,
checking various IPs to ensure that comms worked, etc.

## Steps that didn't work

A list of other things that I tried that were not part of the final system.
- I tried running Unity Editor in a container, just for curiosity. I couldn't
  get it to work, and most of the guides online
  ([example](https://johnaustin.io/articles/2020/running-unity-20201-in-docker))
  were about running Unity in a headless mode for CI purposes. I didn't have prior
  experience with Unity and wanted to try out the Editor, so continued with a
  host install.
- I thought about running the Unity game on the phone. I was able to run the
  demo game from the Cardboard unity plugin
  [quickstart](https://developers.google.com/cardboard/develop/unity/quickstart).
  But Steam VR seemed like a better option.
- I could not get the wired Xbox controller to work if plugged into the
  smartphone, e.g. to play an Android game with controller support. In
  addition, Unity [did not
  support](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.0/manual/SupportedDevices.html)
  the Xbox 360 controller on Android.
- I could not get [Unity
  Remote](https://docs.unity3d.com/2020.3/Documentation/Manual/UnityRemote5.html)
  to work when running the Unity Editor in Ubuntu. It may have had something to
  do with `adb` drivers.

## Final thoughts

If I had time to work on one additional feature, it would be some form of
control by passing information back along VR -> Unity -> ROS. I'd have to think
of a convincing yet simple demo, e.g. using gesture to specify a desired
end-effector position, then planning and executing a motion. Effective control
with a gamepad and RViz already requires some thought, as in this
[video](https://www.youtube.com/watch?v=p_x-HRagLpo) that
[demos](https://ros-planning.github.io/moveit_tutorials/doc/joystick_control_teleoperation/joystick_control_teleoperation_tutorial.html)
joystick control in MoveIt.

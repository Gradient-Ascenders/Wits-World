# Experience motion storyboard

| Moment                      | Motion                                                                                           | Duration                                  | Reduced motion           |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------ |
| First sign-in return         | Seal ring trace, campus reveal, fine details, then approved full mark; repeat while loading continues | 760 ms per pass                        | Full static seal         |
| Normal waiting              | Quest Marker rises a few pixels and rests between cycles; skeletons stay still                   | 900 ms motion within a 1.8 s cycle        | Static marker            |
| Explore selection           | Selected marker outline resolves as the detail sheet changes                                     | 180–220 ms once per deliberate selection  | Immediate selected state |
| Explore range decision      | Checking marker stops and confirmed status settles                                               | 160 ms once per server decision           | Immediate status         |
| Awarded card                | Existing frame lifts slightly while a contained light passes over it                             | 480 ms once per attempt and card identity | Complete static card     |
| Routine confirmation        | Toast enters and exits with a short opacity and vertical shift                                   | 180 ms in, 130 ms out                     | Static transition        |

The seal is the focal sequence. The sign-in return repeats its 760 ms construction while the destination is unresolved, then finishes the current pass and crossfades into the ready app. On the Explore destination, repeating passes also cover map preparation until the map is ready or fails, with a three-second limit after the route is ready. A slower map then continues with its own loading and retry UI. Opening the public home page, later route changes, and in-app waits have no minimum duration and use the Quest Marker where loading feedback is needed. Other motion is local feedback. All effects use the approved seal and marker geometry, existing card frames, and Campus Quest Atlas colors.

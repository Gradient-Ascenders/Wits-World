---
title: 'Accessibility'
description: Keyboard interaction, readable information, and device-local accessibility settings.
---

# Accessibility

Wits World provides keyboard controls, readable status information, and interface
preferences alongside touch and pointer interaction. Visual design choices are
covered in [UI/UX design](ui-ux-design.md).

## Keyboard interaction

Use **Tab** and **Shift+Tab** to move between controls. Buttons support **Enter**
and **Space**. A **Skip to main content** link moves focus directly to the main content.

| Interface            | Keyboard behaviour                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordering questions   | Each item has **Move up** and **Move down** buttons. Focus the appropriate button and activate it to reorder without dragging. The numbered list updates and a status message announces the new order.               |
| Explore sheet        | Focus the sheet handle and activate it to expand or lower the sheet. **Escape** lowers an expanded discovery list or dismisses the open panel, depending on its state. Events can also be selected through the list. |
| Card details         | **Tab** stays within the dialog. Use its Close button or **Escape** to dismiss it. Focus returns to the opening control when that control is still present.                                                          |
| Confirmation dialogs | Focus stays inside the dialog. Cancel or **Escape** dismisses it before submission. During a pending submission, dismissal may be disabled; slow-action feedback provides a way Home.                                |
| Battle action tabs   | **Left/Right Arrow** selects Moves, Power, or Swap. **Home/End** selects the first or last tab; **Tab** moves into the available controls.                                                                           |

The Explore sheet is a contextual panel, rather than a modal dialog. Keyboard
users can move between the map controls, browsing controls, and event information.
The sheet can be adjusted without dragging.

## Readability and focus

Controls have visible keyboard focus, and icon-only buttons have accessible
names. Forms use persistent labels with validation beside the relevant input.
Touch controls aim for at least a 44 × 44px usable target.

Rarity, selection, availability, and battle outcomes use text as well as colour.
Informative images have text alternatives; decorative ornaments do not add extra
screen-reader content. The event list offers map-independent access to campus
information.

Loading and action statuses are available to assistive technology. Decorative
placeholders have no separate announcement, and quiet background polling avoids
repeated announcements. Feedback behaviour is covered in
[Interaction states](state-review.md).

## Accessibility settings

Open **Account → Accessibility** to adjust the interface:

| Setting        | Options                                                     |
| -------------- | ----------------------------------------------------------- |
| Read aloud     | Off or on; enabling it adds a button to start reading       |
| Motion         | Use the device setting, reduce motion, or full motion       |
| Contrast       | Standard or high contrast                                   |
| Interface size | 100%, 125%, or 150%                                         |
| Reading layout | Default or comfortable, with more spacing and shorter lines |
| Font           | Current typography or plain sans-serif                      |

Changes apply immediately and save in the current browser on the device. They do
not sync through the player account. If browser storage is unavailable, changes
apply for the current page session. **Reset to defaults** restores the original
choices.

The default motion preference follows the device setting. Reduced motion limits
animations and animated map movement without removing information or controls.
Layouts respond to larger interface settings so content can wrap and scroll.

## Read aloud

Read aloud uses the browser's speech support and starts only when selected.
Players can pause, resume, or stop reading. It reads visible page content and
player navigation, excluding form inputs and hidden content.

Reading stops when the page or readable content changes, so it does not continue
speaking an outdated view. Availability and voices depend on the browser and
device. If speech support is unavailable, the page remains usable through its
text and controls.

AI declaration: Rewritten with assistance from Codex[GPT-6].

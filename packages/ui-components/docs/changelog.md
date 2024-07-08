---
title: Changelog
---

## 1.10.1

-   Fixed an issue where `Switch` appeared off centre when the base font size was changed.

## 1.9.6

-   Increased performance of `Select`, `Multiselect`, `ComboBox`, `ContextMenu`, `DatepickerSelect`, `SectionedList` components in large lists by upto 485x.
-   Fixed a crash when `null` was passed to `MultiSelect`'s `selectedItems` prop.

## 1.9.5

-   Fixed an issue where select components would sometimes error out with "Maximum update depth..." React error

## 1.9.3

-   Fixed a downshift ref warning in `Select` and `DatepickerSelect` components.


## 1.9.2

-   Removed margin from `Chat` component
-   Fixed an issue where `Select`, `ComboBox`, `ContextMenu`, `DatepickerSelect`, `SectionedList`, `Table.OptionsMenu` components would rerender when scrolling.
-   Migrated `Select`, `ComboBox`, `ContextMenu`, `DatepickerSelect`, `SectionedList`, `Table.OptionsMenu` to use Floating UI instead of Popper.
-   Removed `@popperjs/core` and `react-popper` dependencies.

## 1.9.1

-   Fixed an issue where `MultiSelect` component would rerender when scrolling.
-   Migrated `MultiSelect` to use Floating UI instead of Popper.

## 1.9.0

-   `Chat` component now displays its messages content as `Markdown`.
-   `Chat` component now displays next line breaks.
-   `Textarea` component when `onComplete` prop is passed adds next line with shift + enter.
-   Added a new `Markdown` component.
-   **Breaking** `Chat` now takes a `active_user` prop, and display user info in each message.
-   **Breaking** `Chat` component now only allows users that wrote a message to edit it.

## 1.8.0

-   **Breaking** In `Chat` messages, changed `timestamp` prop to be divided into two `created_at` and `updated_at`.
-   Added "(edited)" indicator to the messages which have been edited in the `Chat` component.
-   `Chat` will now send a message when `Enter` is pressed by the user.
-   `Chat` now shows a disabled state for the `Send` button if the message to be sent is empty.

## 1.7.2

-   Fixed an issue where if a word was too long, such as in an url, the `Chat` message would overflow instead of wrap.
-   Fixed an issue where in `Chat` component if a newline character was added to a comment, on subsequent reloads it would show '/n' in the message.

## 1.7.1

-   Added a new `Chat` component.

## 1.7.0

-   Fixed an issue with `NumericInput` where one could not enter decimal numbers ending in 0.
-   Fixed an issue where one was not able to type a negative number in `NumericInput` in controlled mode unless they started with the number before the sign.

## 1.6.1

-   `UploadDropzone` now has `enablePaste` prop to conditionally activate paste functionality, allowing for more customizable behavior. By default, pasting text directly into the `UploadDropzone` is now disabled, requiring explicit activation via the `enablePaste` prop.

## 1.6.0

-   `ContextMenu` component is now offset a few pixels from the cursor to prevent the first item from being accidentally selected when the context menu is opened.

## 1.5.2

-   Fixed an issue where if selecting the start or end date in a `Datepicker` always resulted in the user selecting the whole range instead of the selected input.
-   Fixed an issue where the filled button in the dark theme was using the wrong color, now it uses `blue1` color.

## 1.4.4

-   Added `onKeyDown` prop to NumericInput to bubble up keydown events
-   Added the `onChange` property to the `onChange` callback dependency

## 1.4.3

-   Pinned fortawesome to `~6.4.0`

## 1.4.1

-   Exposed the Tippyjs delay prop on the `Tooltip` component.

## 1.2.3

-   Fixed an issue where `RadioGroup`'s state was updated twice.

## 1.2.1

-   Fixed an issue where `NumericInput` width could not be changed.
-   Fixed an issue where `NumericInput` overflowed when hovered.
-   Fixed an issue where `NumericInput` input did not take full space available to it.
-   Fixed an issue where `Datepicker` could be overlapped by other components in a horizontal container.
-   Fixed an issue where `Multiselect`'s input took too much space

## 1.1.0

-   Fixed an issue where `Datepicker` in controlled mode would sometimes end up in an infinite loop.
-   Fixed an issue where `Datepicker` if range was given did not show end year in the select.
-   Fixed an issue where `Table` column resizing would not affect cell width.
-   Fixed an issue where `Multiselect` items would overflow when fixed height was given.

## 1.0.1

-   Fixed an issue where `CarouselItem` component could overflow into next component.
-   Fixed an issue where text was not wrapped in `Carousel` component.
-   Fixed an issue where `Switch` component did not respect the root font size

## 1.0.0

-   Initial release
-   Memoize `Table` rows to improve performance.

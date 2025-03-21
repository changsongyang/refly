import * as React from 'react';
import { Primitive } from '@radix-ui/react-primitive';

type Children = { children?: React.ReactNode };
type DivProps = React.ComponentPropsWithoutRef<typeof Primitive.div>;

export type CommandProps = Children &
  DivProps & {
    /**
     * Accessible label for this command menu. Not shown visibly.
     */
    label?: string;
    /**
     * Optionally set to `false` to turn off the automatic filtering and sorting.
     * If `false`, you must conditionally render valid items based on the search query yourself.
     */
    shouldFilter?: boolean;
    /**
     * Custom filter function for whether each command menu item should matches the given search query.
     * It should return a number between 0 and 1, with 1 being the best match and 0 being hidden entirely.
     * By default, uses the `command-score` library.
     */
    filter?: (value: string, search: string, keywords?: string[]) => number;
    /**
     * Optional default item value when it is initially rendered.
     */
    defaultValue?: string;
    /**
     * Optional controlled state of the selected command menu item.
     */
    value?: string;
    /**
     * Event handler called when the selected item of the menu changes.
     */
    onValueChange?: (value: string) => void;
    /**
     * Optionally set to `true` to turn on looping around when using the arrow keys.
     */
    loop?: boolean;
    /**
     * Optionally set to `true` to disable selection via pointer events.
     */
    disablePointerSelection?: boolean;
    /**
     * Set to `false` to disable ctrl+n/j/p/k shortcuts. Defaults to `true`.
     */
    vimBindings?: boolean;
  };

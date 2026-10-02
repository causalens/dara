import { type Action, type Variable, useAction, useVariable } from '@darajs/core';

interface CounterProps {
    value: Variable<number>;
    onclick: Action;
}

/** Explicit hooks retain Dara's current variable and action semantics in local components. */
export default function Counter({ value, onclick }: CounterProps): JSX.Element {
    const [count] = useVariable(value);
    const increment = useAction(onclick);
    return (
        <section aria-label="Custom counter">
            <p>Local component count: {count}</p>
            <button type="button" onClick={() => void increment(count + 1)}>
                Increment with custom action
            </button>
        </section>
    );
}

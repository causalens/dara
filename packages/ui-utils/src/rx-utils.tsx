/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { useEffect, useState } from 'react';
import { Subscription } from 'rxjs';

/**
 * A helper hook that wraps a subscription and makes sure that it is properly cleaned up at the end of the component
 * lifecycle, returns a function that should wrap the call to subscribe
 *
 * @param sub the subscription to cleanup
 */
export function useSubscription(): (sub: Subscription) => void {
    const [subscription, setSubscription] = useState<Subscription>();

    useEffect(() => {
        if (subscription) {
            return () => subscription.unsubscribe();
        }
    }, [subscription]);

    return setSubscription;
}

import { render, screen } from '@testing-library/react';

import DynamicAuthComponent, { registerAuthComponents } from '@/shared/dynamic-component/dynamic-auth-component';

afterEach(() => registerAuthComponents({}));

it.each(['@custom/auth/login', './js/login.tsx'])('renders an unauthenticated screen by source %s', (source) => {
    function ArbitrarilyNamedScreen(): React.ReactNode {
        return <div>Custom login</div>;
    }

    registerAuthComponents({ [source]: ArbitrarilyNamedScreen });
    render(<DynamicAuthComponent component={{ js_source: source, py_module: 'custom_auth' }} />);

    expect(screen.getByText('Custom login')).toBeInTheDocument();
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {render, screen, userEvent} from 'tests/react_testing_utils';
import {getHistory} from 'utils/browser_history';

import App from './app';

jest.mock('components/root', () => {
    const React = jest.requireActual('react');
    const {useHistory, useLocation} = jest.requireActual('react-router-dom');
    const {useInRouterContext, useLocation: useLocationV6, useNavigate} = jest.requireActual('react-router-dom-v5-compat');
    const {getHistory} = jest.requireMock('utils/browser_history');

    const RootStub = () => {
        const history = useHistory();
        const locationV5 = useLocation();
        const locationV6 = useLocationV6();
        const navigate = useNavigate();

        return (
            <div>
                <span>{`in v6 router: ${useInRouterContext()}`}</span>
                <span>{`v5: ${locationV5.pathname}`}</span>
                <span>{`v6: ${locationV6.pathname}`}</span>
                <span>{`same history: ${history === getHistory()}`}</span>
                <button onClick={() => navigate('/pushed-by-v6')}>{'push'}</button>
                <button onClick={() => navigate('/replaced-by-v6', {replace: true})}>{'replace'}</button>
            </div>
        );
    };

    return {
        __esModule: true,
        default: RootStub,
    };
});

describe('components/App', () => {
    test('should render Root inside both the v5 router and the v6 compat router driven by the app history', async () => {
        render(<App/>);

        expect(await screen.findByText('in v6 router: true')).toBeInTheDocument();
        expect(screen.getByText('v5: /a-mocked-location')).toBeInTheDocument();
        expect(screen.getByText('v6: /a-mocked-location')).toBeInTheDocument();
        expect(screen.getByText('same history: true')).toBeInTheDocument();
    });

    test('should route v6 navigation through the app history', async () => {
        render(<App/>);

        // v6 hands the navigator (the v5 history object) a location object rather than a string
        await userEvent.click(await screen.findByText('push'));
        expect(getHistory().push).toHaveBeenCalledTimes(1);
        expect(getHistory().push).toHaveBeenCalledWith(expect.objectContaining({pathname: '/pushed-by-v6'}), undefined, expect.anything());

        await userEvent.click(screen.getByText('replace'));
        expect(getHistory().replace).toHaveBeenCalledTimes(1);
        expect(getHistory().replace).toHaveBeenCalledWith(expect.objectContaining({pathname: '/replaced-by-v6'}), undefined, expect.anything());
    });
});

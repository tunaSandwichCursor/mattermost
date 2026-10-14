// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createMemoryHistory} from 'history';
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {connect, useDispatch, useSelector} from 'react-redux';
import {Link, Route, useLocation} from 'react-router-dom';
import {
    Link as LinkV6,
    Route as RouteV6,
    Routes,
    useLocation as useLocationV6,
    useNavigate,
    useParams,
} from 'react-router-dom-v5-compat';

import {GenericModal} from '@mattermost/components';

import {UserTypes} from 'mattermost-redux/action_types';
import {getUser} from 'mattermost-redux/selectors/entities/users';

import {openModal} from 'actions/views/modals';

import ModalController from 'components/modal_controller';

import mergeObjects from 'packages/mattermost-redux/test/merge_objects';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import {
    renderWithContext,
    screen,
    userEvent,
    waitFor,
} from './react_testing_utils';

describe('renderWithContext', () => {
    test('should be able to render anything', () => {
        const TestComponent = () => {
            return <div>{'Anything'}</div>;
        };

        renderWithContext(
            <TestComponent/>,
            {},
        );

        expect(screen.getByText('Anything')).toBeInTheDocument();
    });

    test('should be able to render react-intl components', () => {
        const TestComponent = () => {
            return (
                <FormattedMessage
                    id='about.buildnumber'
                    defaultMessage='Build Number:'
                />
            );
        };

        renderWithContext(
            <TestComponent/>,
        );

        expect(screen.getByText('Build Number:')).toBeInTheDocument();
    });

    test('should be able to render components using react-intl hooks', () => {
        const TestComponent = () => {
            const intl = useIntl();

            return <div>{intl.formatMessage({id: 'about.hash', defaultMessage: 'Build Hash:'})}</div>;
        };

        renderWithContext(
            <TestComponent/>,
        );

        expect(screen.getByText('Build Hash:')).toBeInTheDocument();
    });

    test('should be able to render react-router components', () => {
        const RouteComponent = () => {
            return <div>{'this is the route component'}</div>;
        };
        const TestComponent = () => {
            return (
                <div>
                    <Route
                        path={''}
                        component={RouteComponent}
                    />
                    <Link to={'/another_page'}>{'Test Link'}</Link>
                </div>
            );
        };

        renderWithContext(
            <TestComponent/>,
        );

        expect(screen.getByText('this is the route component')).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Test Link'})).toBeInTheDocument();
    });

    test('should be able to render react-router v6 components from the compat package', () => {
        const history = createMemoryHistory({initialEntries: ['/team-name/channels/town-square?foo=bar']});

        const RouteComponent = () => {
            const params = useParams();
            return <div>{`v6 route for ${params.team} / ${params.channel}`}</div>;
        };
        const TestComponent = () => {
            return (
                <div>
                    <Routes>
                        <RouteV6
                            path='/:team/channels/:channel'
                            element={<RouteComponent/>}
                        />
                    </Routes>
                    <LinkV6 to='/another_page'>{'Test v6 Link'}</LinkV6>
                </div>
            );
        };

        renderWithContext(<TestComponent/>, {}, {history});

        expect(screen.getByText('v6 route for team-name / town-square')).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Test v6 Link'})).toHaveAttribute('href', '/another_page');
    });

    test('should keep react-router v5 and v6 on the same location when navigating with either API', async () => {
        const history = createMemoryHistory({initialEntries: ['/start']});

        const TestComponent = () => {
            const locationV5 = useLocation();
            const locationV6 = useLocationV6();
            const navigate = useNavigate();

            return (
                <div>
                    <span>{`v5: ${locationV5.pathname}${locationV5.search}`}</span>
                    <span>{`v6: ${locationV6.pathname}${locationV6.search}`}</span>
                    <button onClick={() => navigate('/from-v6?query=1')}>{'Navigate with v6'}</button>
                    <button onClick={() => navigate(-1)}>{'Go back with v6'}</button>
                    <button onClick={() => history.push('/from-v5')}>{'Navigate with v5'}</button>
                </div>
            );
        };

        renderWithContext(<TestComponent/>, {}, {history});

        expect(screen.getByText('v5: /start')).toBeInTheDocument();
        expect(screen.getByText('v6: /start')).toBeInTheDocument();

        await userEvent.click(screen.getByText('Navigate with v6'));

        expect(history.location.pathname).toBe('/from-v6');
        expect(screen.getByText('v5: /from-v6?query=1')).toBeInTheDocument();
        expect(screen.getByText('v6: /from-v6?query=1')).toBeInTheDocument();

        await userEvent.click(screen.getByText('Navigate with v5'));

        expect(screen.getByText('v5: /from-v5')).toBeInTheDocument();
        expect(screen.getByText('v6: /from-v5')).toBeInTheDocument();

        await userEvent.click(screen.getByText('Go back with v6'));

        expect(history.location.pathname).toBe('/from-v6');
        expect(screen.getByText('v5: /from-v6?query=1')).toBeInTheDocument();
        expect(screen.getByText('v6: /from-v6?query=1')).toBeInTheDocument();
    });

    test('should be able to render components that use connect to access the Redux store', () => {
        const UnconnectedTestComponent = (props: {numProfiles: number}) => {
            return <div>{`There are ${props.numProfiles} users loaded`}</div>;
        };
        const TestComponent = connect((state: GlobalState) => ({
            numProfiles: Object.keys(state.entities.users.profiles).length,
        }))(UnconnectedTestComponent);

        renderWithContext(
            <TestComponent/>,
        );

        expect(screen.getByText('There are 0 users loaded')).toBeInTheDocument();
    });

    test('should be able to render components that use hooks to access the Redux store', () => {
        const TestComponent = () => {
            const numProfiles = useSelector((state: GlobalState) => Object.keys(state.entities.users.profiles).length);
            return <div>{`There are ${numProfiles} users loaded`}</div>;
        };

        renderWithContext(
            <TestComponent/>,
        );

        expect(screen.getByText('There are 0 users loaded')).toBeInTheDocument();
    });

    test('should be able to rerender components without losing context', () => {
        const TestComponent = (props: {appTitle: string}) => {
            return (
                <FormattedMessage
                    id='about.title'
                    defaultMessage='About {appTitle}'
                    values={{
                        appTitle: props.appTitle,
                    }}
                />
            );
        };

        const {rerender} = renderWithContext(
            <TestComponent appTitle='Mattermost'/>,
        );

        expect(screen.getByText('About Mattermost')).toBeInTheDocument();

        rerender(
            <TestComponent appTitle='Mattermots'/>,
        );

        expect(screen.getByText('About Mattermots')).toBeInTheDocument();
    });

    test('should be able to inject store state and replace it later', () => {
        const initialState = {
            entities: {
                users: {
                    profiles: {
                        user1: TestHelper.getUserMock({id: 'user1', username: 'Alpha'}),
                        user2: TestHelper.getUserMock({id: 'user2', username: 'Bravo'}),
                    },
                },
            },
        };

        const TestComponent = () => {
            const user1 = useSelector((state: GlobalState) => getUser(state, 'user1'));
            const user2 = useSelector((state: GlobalState) => getUser(state, 'user2'));

            return <div>{`User1 is ${user1.username} and User2 is ${user2.username}!`}</div>;
        };

        const {replaceStoreState} = renderWithContext(
            <TestComponent/>,
            initialState,
        );

        expect(screen.getByText('User1 is Alpha and User2 is Bravo!')).toBeInTheDocument();

        replaceStoreState(mergeObjects(initialState, {
            entities: {
                users: {
                    profiles: {
                        user1: {username: 'Charlie'},
                    },
                },
            },
        }));

        expect(screen.getByText('User1 is Charlie and User2 is Bravo!')).toBeInTheDocument();

        replaceStoreState(mergeObjects(initialState, {
            entities: {
                users: {
                    profiles: {
                        user2: {username: 'Delta'},
                    },
                },
            },
        }));

        // Since this replaces the state, user1's username goes back to the initial value
        expect(screen.getByText('User1 is Alpha and User2 is Delta!')).toBeInTheDocument();
    });

    test('should be able to update store state', () => {
        const initialState = {
            entities: {
                users: {
                    profiles: {
                        user1: TestHelper.getUserMock({id: 'user1', username: 'Echo'}),
                        user2: TestHelper.getUserMock({id: 'user2', username: 'Foxtrot'}),
                    },
                },
            },
        };

        const TestComponent = () => {
            const user1 = useSelector((state: GlobalState) => getUser(state, 'user1'));
            const user2 = useSelector((state: GlobalState) => getUser(state, 'user2'));

            return <div>{`User1 is ${user1.username} and User2 is ${user2.username}!`}</div>;
        };

        const {updateStoreState} = renderWithContext(
            <TestComponent/>,
            initialState,
        );

        expect(screen.getByText('User1 is Echo and User2 is Foxtrot!')).toBeInTheDocument();

        updateStoreState({
            entities: {
                users: {
                    profiles: {
                        user1: {username: 'Golf'},
                    },
                },
            },
        });

        expect(screen.getByText('User1 is Golf and User2 is Foxtrot!')).toBeInTheDocument();

        updateStoreState({
            entities: {
                users: {
                    profiles: {
                        user2: {username: 'Hotel'},
                    },
                },
            },
        });

        expect(screen.getByText('User1 is Golf and User2 is Hotel!')).toBeInTheDocument();
    });

    test('should be able to mix rerendering and updating store state', () => {
        const initialState = {
            entities: {
                users: {
                    profiles: {
                        user1: TestHelper.getUserMock({id: 'user1', username: 'India'}),
                    },
                },
            },
        };

        const TestComponent = (props: {greeting: string}) => {
            const user1 = useSelector((state: GlobalState) => getUser(state, 'user1'));

            return <div>{`${props.greeting}, ${user1.username}!`}</div>;
        };

        const {rerender, updateStoreState} = renderWithContext(
            <TestComponent greeting='Hello'/>,
            initialState,
        );

        expect(screen.getByText('Hello, India!')).toBeInTheDocument();

        updateStoreState({
            entities: {
                users: {
                    profiles: {
                        user1: {username: 'Juliet'},
                    },
                },
            },
        });

        expect(screen.getByText('Hello, Juliet!')).toBeInTheDocument();

        rerender(<TestComponent greeting='Salutations'/>);

        expect(screen.getByText('Salutations, Juliet!')).toBeInTheDocument();

        updateStoreState({
            entities: {
                users: {
                    profiles: {
                        user1: {username: 'Kilo'},
                    },
                },
            },
        });

        expect(screen.getByText('Salutations, Kilo!')).toBeInTheDocument();

        rerender(<TestComponent greeting='Bonjour'/>);

        expect(screen.getByText('Bonjour, Kilo!')).toBeInTheDocument();
    });

    test('should be able to dispatch and handle redux actions', async () => {
        const TestComponent = () => {
            const user1 = useSelector((state: GlobalState) => getUser(state, 'user1'));
            const dispatch = useDispatch();

            const username = user1 ? user1.username : 'NOT_LOADED';

            const loadUser = () => {
                dispatch({
                    type: UserTypes.RECEIVED_PROFILE,
                    data: {id: 'user1', username: 'Lima'},
                });
            };

            return (
                <div>
                    <span>{`User1 is ${username}!`}</span>
                    <button onClick={loadUser}>{'Load User'}</button>
                </div>
            );
        };

        renderWithContext(<TestComponent/>);

        expect(screen.getByText('User1 is NOT_LOADED!')).toBeInTheDocument();

        await userEvent.click(screen.getByText('Load User'));

        expect(screen.getByText('User1 is Lima!')).toBeInTheDocument();
    });

    test('should be able to render modals using a ModalController', async () => {
        const TestComponent = () => {
            const dispatch = useDispatch();

            const openTestModal = () => {
                dispatch(openModal({
                    modalId: 'test_modal',
                    dialogType: TestModal,
                }));
            };

            return (
                <div>
                    <button onClick={openTestModal}>{'Open Modal'}</button>
                </div>
            );
        };

        const TestModal = (props: {onExited: () => void}) => {
            return (
                <GenericModal onExited={props.onExited}>
                    <p>{'This is a modal!'}</p>
                </GenericModal>
            );
        };

        renderWithContext(
            <>
                <TestComponent/>
                <ModalController/>
            </>,
        );

        expect(screen.getByText('Open Modal')).toBeVisible();

        await userEvent.click(screen.getByText('Open Modal'));

        // Use waitFor because the modal animates in and out
        await waitFor(() => {
            expect(screen.queryByText('This is a modal!')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByLabelText('Close'));

        await waitFor(() => {
            expect(screen.queryByText('This is a modal!')).not.toBeInTheDocument();
        });
    });
});

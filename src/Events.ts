const Events = {
    userLoggedIn: 'userLoggedIn' as 'userLoggedIn',
    sessionOpened: 'sessionOpened' as 'sessionOpened',
    hashChange: 'hashChange' as 'hashChange'
};

type Events = (typeof Events)[keyof typeof Events];
export { Events };

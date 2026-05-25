import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import passport from 'passport';
import env from 'dotenv';
import { prisma } from './prismaConfig.js';

env.config();

// Customer strategy
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID 
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_CALLBACK_USER = process.env.GOOGLE_CALLBACK_USER 
const GOOGLE_CALLBACK_SHOP = process.env.GOOGLE_CALLBACK_SHOP 

console.log('Passport Google callbacks:', { userCallback: GOOGLE_CALLBACK_USER, shopCallback: GOOGLE_CALLBACK_SHOP });

passport.use('google-customer', new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_USER
},
    async function (accessToken, refreshToken, profile, cb) {
        try {
            const existinguser = await prisma.user.findFirst({
                where: {
                    email: profile.emails[0].value
                }
            })
            if (existinguser) {
                return cb(null, existinguser);
            }
            else {
                const user = await prisma.user.create({
                    data: {
                        googleid: profile.id,
                        name: profile.displayName,
                        profileimage: profile.photos?.[0]?.value,
                        email: profile.emails?.[0]?.value
                    }
                })

                return cb(null, user)
            }

        }
        catch (err) {
            console.log("Some Error Occured")
            return cb(err, null);
        }
    }
));

passport.use('google-shopkeeper', new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_SHOP
},
    async function (accessToken, refreshToken, profile, cb) {
        try {
            const existinguser = await prisma.user.findFirst({
                where: {
                    email: profile.emails[0].value
                }
            })

            if (existinguser) {
                return cb(null, existinguser);
            }
            else {
                const user = await prisma.user.create({
                    data: {
                        googleid: profile.id,
                        name: profile.displayName,
                        profileimage: profile.photos?.[0]?.value,
                        email: profile.emails?.[0]?.value
                    }
                })

                return cb(null, user)

            }

        }
        catch (err) {
            console.log("Some Error Occured")
            return cb(err, null);
        }


    }
));

passport.serializeUser((user, done) => {
    done(null, user.googleid);
});

passport.deserializeUser((id, done) => {
    try {
        done(null, { id });
    } catch (err) {
        done(err, null);
    }
});

export default passport;


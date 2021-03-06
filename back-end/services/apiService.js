'use strict';
var express = require("express");
var Request = require("request");
var config = require('../config');
var async = require("async");
var mongo = require('mongodb');
var crypto = require('crypto');
var qs = require('qs');
var fs = require('fs')
var logger = require('morgan');
var cron = require('cron').CronJob;
const { Expo } = require('expo-server-sdk');
var ObjectID = mongo.ObjectID;
var baseUrl = config.baseUrl;

//======================MODELS============================
var UserModels = require('../models/user');
var ContentModels = require('../models/content');
var RecyclingProductModels = require('../models/recyclingProduct');
var CauseModels = require('../models/cause');
var VendorModels = require('../models/vendor');
var ProductModels = require('../models/product');
var OrderModels = require('../models/order');
var AdsModels = require('../models/ads');
var productBarcodeModels = require('../models/productbarcode');
//======================Schema============================
//======================Module============================
var pushNotification = require('../modules/pushNotification');
var mailProperty = require('../modules/sendMail');

var apiService = {
    //Contant page
    cms: (data, callback) => {
        if (!data.content_type || typeof data.content_type === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide content type", "response_data": [] });
        } else {
            ContentModels.contentDetails(data, function (result) {
                if (result.response_code == 2000) {
                    callback(result.response_data.description);
                } else {
                    callback({
                        "response_code": 5002,
                        "response_message": "User not found",
                        "response_data": []
                    });
                }
            });
        }
    },
    //register
    register: (data, callback) => {
        async.waterfall([
            function (nextCb) {
                var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
                if (!data.first_name || typeof data.first_name === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide first name", "response_data": {} });
                } else if (!data.last_name || typeof data.last_name === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide last name", "response_data": {} });
                } else if (!data.email || typeof data.email === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide email address", "response_data": {} });
                } else if (!re.test(String(data.email).toLowerCase())) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide valid email address", "response_data": {} });
                } else if (!data.password || typeof data.password === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide password", "response_data": {} });
                } else if (!data.phone_no || typeof data.phone_no === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide phone number", "response_data": {} });
                } else if (!data.devicetoken || typeof data.devicetoken === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide devicetoken", "response_data": {} });
                } else if (!data.apptype || typeof data.apptype === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide app type", "response_data": {} });
                } else {
                    data._id = new ObjectID;
                    data.verification_code = Math.random().toString().replace('0.', '').substr(0, 4);
                    UserModels.register(data, function (result) {
                        nextCb(null, result);
                    });
                }
            },
            function (arg1, nextCb) {
                if (arg1.response_code == 2000) {
                    mailProperty('emailVerificationMail')(data.email, {
                        name: data.first_name + ' ' + data.last_name,
                        email: data.email,
                        verification_code: data.verification_code,
                        site_url: config.liveUrl,
                        date: new Date()
                    }).send();
                    nextCb(null, arg1);
                } else {
                    nextCb(null, arg1);
                }
            }
        ], function (err, result) {
            if (err) {
                callback({
                    "response_code": 5005,
                    "response_message": "INTERNAL DB ERROR",
                    "response_data": err
                });
            } else {
                callback(result);
            }
        });
    },
    //Email Verification
    emailVerification: (data, callback) => {
        if (!data.email || typeof data.email === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide email address", "response_data": {} })
        } else if (!data.verification_code || typeof data.verification_code === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide verification code", "response_data": {} })
        } else {
            UserModels.emailVerify(data, function (result) {
                callback(result);
            });
        }
    },
    // Resend email verification code
    resendEmailVerifyCode: (data, callback) => {
        if (!data.email || typeof data.email === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide email address", "response_data": {} })
        } else {
            data.verification_code = Math.random().toString().replace('0.', '').substr(0, 4);
            UserModels.resendEmailVerifyCode(data, function (result) {
                mailProperty('emailVerificationMail')(data.email, {
                    name: result.response_data.first_name + ' ' + result.response_data.last_name,
                    email: data.email,
                    verification_code: data.verification_code,
                    site_url: config.liveUrl,
                    date: new Date()
                }).send();
                callback({
                    response_code: result.response_code,
                    response_message: result.response_message
                });
            });
        }
    },
    //login 
    login: (data, callback) => {
        if (!data.email || typeof data.email === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide email address", "response_data": {} });
        } else if (!data.password || typeof data.password === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide password", "response_data": {} });
        } else if (!data.devicetoken || typeof data.devicetoken === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide devicetoken", "response_data": {} });
        } else if (!data.pushtoken || typeof data.pushtoken === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide pushtoken", "response_data": {} });
        } else if (!data.apptype || typeof data.apptype === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide apptype", "response_data": {} });
        } else {
            UserModels.login(data, function (result) {
                callback(result);
            });
        }
    },
    //Forgot password
    forgotPassword: (data, callback) => {
        if (!data.email || typeof data.email === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide email address", "response_data": {} });
        } else {
            data.otp = Math.random().toString().replace('0.', '').substr(0, 4);
            UserModels.forgotPassword(data, function (result) {
                mailProperty('sendOTPdMail')(data.email, {
                    otp: data.otp,
                    email: data.email,
                    name: result.response_data.first_name + ' ' + result.response_data.last_name,
                    site_url: config.liveUrl,
                    date: new Date()
                }).send();
                callback({ "response_code": result.response_code, "response_message": result.response_message });
            });
        }

    },
    //verify Otp
    verifyOtp: (data, callback) => {
        if (!data.email || typeof data.email === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide email address", "response_data": {} })
        } else if (!data.otp || typeof data.otp === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide OTP", "response_data": {} })
        } else {
            UserModels.verifyOtp(data, function (result) {
                callback(result);
            });
        }
    },
    //reset password 
    resetPassword: (data, callback) => {
        if (!data.email || typeof data.email === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide email address", "response_data": {} });
        } else if (!data.password || typeof data.password === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide new password", "response_data": {} });
        } else {
            UserModels.resetPassword(data, function (result) {
                callback(result);
            });
        }
    },
    //Profile View
    viewProfile: (data, callback) => {
        if (!data._id || typeof data._id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else {
            UserModels.viewProfile(data, function (result) {
                callback(result);
            })
        }
    },
    //Edit profile
    editProfile: (data, callback) => {
        if (!data._id || typeof data._id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else if (!data.first_name || typeof data.first_name === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide first name", "response_data": {} });
        } else if (!data.last_name || typeof data.last_name === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide last name", "response_data": {} });
        } else if (!data.phone_no || typeof data.phone_no === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide phone number", "response_data": {} });
        } else {
            UserModels.editProfile(data, function (result) {
                callback(result);
            });
        }
    },
    //Edit Profile Image
    editProfileImage: (data, fileData, callback) => {
        if (!data._id || typeof data._id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else if (!fileData || typeof fileData === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide profile image", "response_data": {} });
        } else {
            var pic = fileData.image;
            var ext = pic.name.slice(pic.name.lastIndexOf('.'));
            var fileName = Date.now() + ext;
            var folderpath = config.uploadProfilepicPath;
            pic.mv(folderpath + fileName, function (err) {
                if (err) {
                    callback({
                        "response_code": 5005,
                        "response_message": "INTERNAL DB ERROR",
                        "response_data": err
                    });
                } else {
                    data.profile_image = config.profilepicPath + fileName;
                    UserModels.editProfileImage(data, function (result) {
                        callback(result);
                    });
                }
            });
        }
    },
    //Change password 
    changePassword: (data, callback) => {
        if (!data._id || typeof data._id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else if (!data.currentpassword || typeof data.currentpassword === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide current password", "response_data": {} });
        } else if (!data.password || typeof data.password === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide password", "response_data": {} });
        } else {
            UserModels.changePassword(data, function (result) {
                callback(result);
            });
        }

    },
    // List Recycling product type
    recyclingProductTypeList: (callback) => {
        var data = '';
        RecyclingProductModels.recyclingProductTypeList(data, function (result) {
            callback(result);
        });
    },
    // List Recycling product type
    recyclingProductScanMsgList: (data,callback) => {
        if (!data.productType || typeof data.productType === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide product type id", "response_data": {} });
        } else if (!data.number || typeof data.number === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide scan no", "response_data": {} });
        } else {
            RecyclingProductModels.recyclingProductScanMsgList(data, function (result) {
                callback(result);
            });
        }
        
    },
    //Recycling product add
    recyclingProductAdd: (data, fileData, callback) => {
        async.waterfall([
            function (nextCb) {
                if (!data.user_id || typeof data.user_id === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
                } else if (!data.productType || typeof data.productType === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide product type id", "response_data": {} });
                } else if (!data.companyName || typeof data.companyName === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide company name", "response_data": {} });
                } else if (!data.binCode || typeof data.binCode === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide bin code", "response_data": {} });
                } else if (!data.place || typeof data.place === undefined) {
                    nextCb(null, { "response_code": 5002, "response_message": "please provide place", "response_data": {} });
                }  else {
                    nextCb(null, { "response_code": 2000, "response_message": "", "response_data": {} });
                }
            }, function (arg, nextCb) {
                if (arg.response_code === 2000) {
                    if (data.barcodeId != '' && data.barcodeId != null && data.barcodeId != undefined) {
                        productBarcodeModels.searchProductByBarcodeId(data, function (result) {
                            if (result.response_code == 2000) {
                                data.barCode = result.response_data.barcode;
                                data.productType = result.response_data.productType;
                                data.productImage = result.response_data.image;
                                nextCb(null, arg);
                            } else {
                                nextCb(null, result);
                            }
                        });
                    } else {
                        nextCb(null, arg);
                    }
                } else {
                    nextCb(null, arg);
                }
            }, function (arg, nextCb) {
                if (arg.response_code === 2000) {
                    if (data.barcodeId != '' && data.barcodeId != null && data.barcodeId != undefined) {
                        RecyclingProductModels.recyclingProductCheck(data, function (result) {
                            if (result.response_data == 0) {
                                nextCb(null, { "response_code": 2000, "response_message": "", "response_data": {} });
                            } else {
                                nextCb(null, { "response_code": 5002, "response_message": "You added this product.After one hour you can again add this product.", "response_data": {} });
                            }
                        });
                    } else {
                        nextCb(null, arg);
                    }

                } else {
                    nextCb(null, arg);
                }
            }, function (arg, nextCb) {
                if (arg.response_code === 2000) {
                    if (fileData != null && fileData != undefined && fileData != '') {
                        if (fileData.productImage != null && fileData.productImage != undefined && fileData.productImage != '') {
                            var pic = fileData.productImage;
                            var ext = pic.name.slice(pic.name.lastIndexOf('.'));
                            var fileName = Date.now() + ext;
                            var folderpath = config.uploadRecyclingProductpicPath;
                            pic.mv(folderpath + fileName, function (err) {
                                if (err) {
                                    nextCb(null, arg);
                                } else {
                                    data.productImage = config.recyclingProductpicPath + fileName;
                                    nextCb(null, arg);
                                }
                            });
                        } else {
                            nextCb(null, arg);
                        }
                    } else {
                        nextCb(null, arg);
                    }
                } else {
                    nextCb(null, arg);
                }
            }, function (arg, nextCb) {
                if (arg.response_code === 2000) {
                    if (fileData != null && fileData != undefined && fileData != '') {
                        if (fileData.barCodeImage != null && fileData.barCodeImage != undefined && fileData.barCodeImage != '') {
                            var pic = fileData.barCodeImage;
                            var ext = pic.name.slice(pic.name.lastIndexOf('.'));
                            var fileName = Date.now() + ext;
                            var folderpath = config.uploadBarCodepicPath;
                            pic.mv(folderpath + fileName, function (err) {
                                if (err) {
                                    nextCb(null, arg);
                                } else {
                                    data.barCodeImage = config.barCodepicPath + fileName;
                                    nextCb(null, arg);
                                }
                            });
                        } else {
                            nextCb(null, arg);
                        }
                    } else {
                        nextCb(null, arg);
                    }
                } else {
                    nextCb(null, arg);
                }
            }, function (arg, nextCb) {
                if (arg.response_code === 2000) {
                    data._id = new ObjectID;
                    data.reward = 5;
                    console.log(data);
                    RecyclingProductModels.recyclingProductAdd(data, function (result) {
                        nextCb(null, result);
                    });
                } else {
                    nextCb(null, arg);
                }
            }, function (arg, nextCb) {
                if (arg.response_code === 2000) {
                    RecyclingProductModels.rewadAdd(data, function (result) {
                        if (result.response_code == 2000) {
                            nextCb(null, {
                                response_code: arg.response_code,
                                response_message: 'Data added successfully',
                                response_data: {
                                    remainReward: result.response_data.remainReward,
                                    pushData: {
                                        deviceToken: result.response_data.pushtoken,
                                        "body": "Congratulations you have earned 5 points.",
                                        "data": {}
                                    }
                                },
                            });
                        } else {
                            nextCb(null, arg);
                        }
                    });
                } else {
                    nextCb(null, arg);
                }
            }
        ], function (err, content) {
            if (err) {
                callback({
                    "response_code": 5005,
                    "response_message": "INTERNAL DB ERROR",
                    "response_data": err
                });
            } else {
                callback(content);
            }
        })
    },
    // List Recycling product 
    recyclingProductListByUser: (data, callback) => {
        if (!data.user_id || typeof data.user_id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else {
            async.parallel({
                totalReward: function (callback) {
                    RecyclingProductModels.totalRewardByUser(data, function (result) {
                        callback(null, result.response_data);
                    });
                },
                list: function (callback) {
                    RecyclingProductModels.recyclingProductListByUser(data, function (result) {
                        callback(null, result.response_data);
                    });
                },
                totalWeight: function (callback) {
                    RecyclingProductModels.totalrecyclingProductByUser(data, function (result) {
                        callback(null, result.response_data);
                    });
                },
                
            }, function (err, content) {
                if (err) {
                    callback({
                        "response_code": 5005,
                        "response_message": "INTERNAL DB ERROR",
                        "response_data": err
                    });
                } else {
                    callback({
                        "response_code": 2000,
                        "response_message": "List",
                        "response_data": {
                            list: content.list,
                            totalReward: content.totalReward,
                            totalWeight: content.totalWeight
                        }
                    });
                }
            })

        }
    },
    // recyclingProductBarChart
    recyclingProductBarChart: (data, callback) => {
        if (!data.user_id || typeof data.user_id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else {
            RecyclingProductModels.recyclingProductBarChart(data, function (result) {
                callback(result);
            });
        }
    },
    // recyclingProductPieChart
    recyclingProductPieChart: (data, callback) => {
        if (!data.user_id || typeof data.user_id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else {
            RecyclingProductModels.recyclingProductPieChart(data, function (result) {
                callback(result);
            });
        }
    },
   
    // List cause
    causeList: (data, callback) => {
        CauseModels.causeList(data, function (result) {
            callback(result);
        });
    },
    // Cause details
    causeDetail: (data, callback) => {
        if (!data._id || typeof data._id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide cause id", "response_data": {} });
        } else {
            CauseModels.causeDetail(data, function (result) {
                callback(result);
            });
        }
    },
    // List vendor
    vendorList: (data, callback) => {
        VendorModels.vendorList(data, function (result) {
            callback(result);
        });
    },
    // Vendor details
    vendorDetail: (data, callback) => {
        if (!data._id || typeof data._id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide vendor id", "response_data": {} });
        } else {
            async.parallel({
                vendorDetail: function (callback) {
                    VendorModels.vendorDetail(data, function (result) {
                        callback(null, result.response_data);
                    });
                },
                productList: function (callback) {
                    ProductModels.productListByVendor(data, function (result) {
                        callback(null, result.response_data);
                    });
                },
            }, function (err, content) {
                if (err) {
                    callback({
                        "response_code": 5005,
                        "response_message": "INTERNAL DB ERROR",
                        "response_data": err
                    });
                } else {
                    callback({
                        "response_code": 2000,
                        "response_message": "Vendor detail",
                        "response_data": {
                            detail: content.vendorDetail,
                            products: content.productList
                        }
                    });
                }
            });

        }
    },
    //Home page
    home: (callback) => {
        async.parallel({
            featuredVendor: function (callback) {
                VendorModels.featuredVendorList(function (result) {
                    callback(null, result.response_data);
                });
            },
            popularProduct: function (callback) {
                ProductModels.popularProductList(function (result) {
                    callback(null, result.response_data);
                });
            },
        }, function (err, content) {
            if (err) {
                callback({
                    "response_code": 5005,
                    "response_message": "INTERNAL DB ERROR",
                    "response_data": err
                });
            } else {
                callback({
                    "response_code": 2000,
                    "response_message": "List",
                    "response_data": {
                        featuredVendor: content.featuredVendor,
                        popularProduct: content.popularProduct
                    }
                });
            }
        })
    },
    // List product category
    productCategoryList: (callback) => {
        var data = '';
        ProductModels.productCategoryList(data, function (result) {
            callback(result);
        });
    },
    // List product
    productList: (data, callback) => {
        ProductModels.productList(data, function (result) {
            callback(result);
        });
    },
    // Product details
    productDetail: (data, callback) => {
        if (!data._id || typeof data._id === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide product id", "response_data": {} });
        } else {
            ProductModels.productDetail(data, function (result) {
                callback(result);
            });
        }
    },
    //Add to cart
    addTocart: (data, callback) => {
        if (!data.userId || typeof data.userId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else if (!data.productId || typeof data.productId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide product id", "response_data": {} });
        } else if (!data.qty || typeof data.qty === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide product quantity", "response_data": {} });
        } else {
            OrderModels.addToCart(data, function (result) {
                callback(result);
            });
        }
    },
    //Cart list
    cartList: (data, callback) => {
        if (!data.userId || typeof data.userId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else {
            OrderModels.cartList(data, function (result) {
                callback(result);
            });
        }
    },
    // Product qty update in cart
    cartQuatityUpdate: (data, callback) => {
        if (!data.cartId || typeof data.cartId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide cart id", "response_data": {} });
        } else if (!data.userId || typeof data.userId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else if (!data.qty || typeof data.qty === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide quantity", "response_data": {} });
        } else {
            OrderModels.cartQuatityUpdate(data, function (result) {
                callback(result);
            });
        }
    },
    // Product delete from cart
    cartProductDelete: (data, callback) => {
        if (!data.cartId || typeof data.cartId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide cart id", "response_data": {} });
        } else if (!data.userId || typeof data.userId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else {
            OrderModels.cartProductDelete(data, function (result) {
                callback(result);
            });
        }
    },
    // Add shipping address 
    addShippingAddress: (data, callback) => {
        if (!data.userId || typeof data.userId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else if (!data.addressOne || typeof data.addressOne === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide address one", "response_data": {} });
        } else if (!data.country || typeof data.country === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide country", "response_data": {} });
        } else if (!data.state || typeof data.state === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide state", "response_data": {} });
        } else if (!data.zipCode || typeof data.zipCode === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide zipcode", "response_data": {} });
        } else {
            OrderModels.addShippingAddress(data, function (result) {
                callback(result);
            });
        }
    },
    //View shipping address
    viewShippingAddress: (data, callback) => {
        if (!data.userId || typeof data.userId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else {
            OrderModels.viewShippingAddress(data, function (result) {
                callback(result);
            });
        }
    },
    //order checkout
    checkOut: (data, callback) => {
        if (!data.userId || typeof data.userId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else {
            OrderModels.checkOut(data, function (result) {
                if (result.response_code == 2000) {
                    callback({
                        "response_code": 2000,
                        "response_message": "Order is placed",
                        "response_data": {
                            orderId: result.response_data.orderId,
                            remainReward: result.response_data.remainReward,
                            pushData: {
                                deviceToken: result.response_data.pushtoken,
                                "body": "Your order " + result.response_data.orderId + "  has been placed successfully.",
                                "data": {}
                            }
                        }
                    });
                } else {
                    callback(result);
                }

            });
        }

    },
    //Order list
    orderList: (data, callback) => {
        if (!data.userId || typeof data.userId === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide user id", "response_data": {} });
        } else {
            OrderModels.orderList(data, function (result) {
                callback(result);
            });
        }
    },
    contactUs: (data, callback) => {
        var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        if (!data.firstName || typeof data.firstName === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide first name", "response_data": {} });
        } else if (!data.lastName || typeof data.lastName === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide last name", "response_data": {} });
        } else if (!data.email || typeof data.email === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide email address", "response_data": {} });
        } else if (!re.test(String(data.email).toLowerCase())) {
            nextCb(null, { "response_code": 5002, "response_message": "please provide valid email address", "response_data": {} });
        } else if (!data.message || typeof data.message === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide message", "response_data": {} });
        } else {
            mailProperty('contactUsMail')(data.email, {
                name: data.firstName + ' ' + data.firstName,
                email: data.email,
                message: data.message,
                site_url: config.liveUrl,
                date: new Date()
            }).send();
            callback({
                "response_code": 2000,
                "response_message": "Thank you for contacting us, a Green Litter Bug Representative will contact your at our earliest convenience.",
                "response_data": {}
            });
        }
    },

    //Featured ads list
    featuredAdsList: (data, callback) => {
        AdsModels.featuredAdslist(data, function (result) {
            callback(result);
        });
    },
    //searchRecyclingProduct
    searchRecyclingProduct: (data, callback) => {
        if (!data.barcode || typeof data.barcode === undefined) {
            callback({ "response_code": 5002, "response_message": "please provide barcode", "response_data": {} });
        } else {
            productBarcodeModels.searchProductByBarcode(data, function (result) {
                callback(result);
            });
        }
    },
    //Update recycling product add status
    UpdateStatusRecyclingProduct: (callback) => {
        RecyclingProductModels.UpdateStatusRecyclingProduct(function (result) {
            callback(result);
        });
    }
};
var job1 = new cron({
    cronTime: '0 */10 * * * *',
    onTick: function () {
        apiService.UpdateStatusRecyclingProduct(function (result) {
            console.log('result', result);
        });
    },
    start: true,
    timeZone: 'GMT',
    runOnInit: false
}).start();
module.exports = apiService;
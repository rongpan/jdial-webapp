sudo apt-get update -y

# install dependencies for Sketch
sudo apt-get install -y build-essential autoconf libtool flex bison mercurial zsh

# install Java 8 JDK
sudo apt-get install -y software-properties-common python-software-properties
sudo apt-add-repository ppa:openjdk-r/ppa -y
sudo apt-get update -y
sudo apt-get install openjdk-8-jdk -y
